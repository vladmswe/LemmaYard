// Java judge runner, baked into the sandbox image (PLAN.md section 5; same
// protocol as harness.py and harness.js).
//
// Protocol: reads ONE line of JSON from stdin
//   {language, code, signature, tests: [{input}], timeLimitMs, stopOnError, nonce}
// and writes frames "\n@@<nonce>@@<json>\n" to the real stdout (fd 1):
//   {kind:"compile_error", error}
//   {kind:"fatal", status:"error"|"timeout", error, stdout, memoryKb}
//   {kind:"test", index, status:"ok"|"error"|"timeout", actual?, error?, memory?,
//    timeMs, stdout, memoryKb}
//   {kind:"done", stdout, memoryKb}
// `stdout` in a frame is the user output captured since the previous frame.
// Expected values never enter the container; the worker judges.
//
// The user's code is compiled in memory with javax.tools (no files are
// written) and loaded by its own class loader whose parent is the platform
// loader, so it cannot name this class. Each test runs in a fresh thread with
// a large stack; the main thread enforces the time limit with join() and ends
// the process (Runtime.halt) after a timeout, since a Java thread cannot be
// stopped. JVM start-up and compilation are outside every test's timeMs.
//
// Type mapping (signature type -> accepted Java types; the parameter types the
// user declares decide, by reflection):
//   int     -> int, long, Integer, Long, double (values outside the 32-bit
//              range are rejected for int/Integer with a hint to use long)
//   float   -> double, Double, float, Float
//   bool    -> boolean, Boolean
//   string  -> String, char[] (and char for one-character strings)
//   T[]     -> arrays of the above, or List<...> / Collection<...>
// Return values: any of the above, arrays, Iterables; integers must be within
// ±(2^53−1), doubles must be finite.

import java.io.ByteArrayOutputStream;
import java.io.FileDescriptor;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.PrintStream;
import java.lang.reflect.Array;
import java.lang.reflect.Constructor;
import java.lang.reflect.GenericArrayType;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;
import java.lang.reflect.WildcardType;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Pattern;
import javax.tools.Diagnostic;
import javax.tools.DiagnosticCollector;
import javax.tools.FileObject;
import javax.tools.ForwardingJavaFileManager;
import javax.tools.JavaCompiler;
import javax.tools.JavaFileManager;
import javax.tools.JavaFileObject;
import javax.tools.SimpleJavaFileObject;
import javax.tools.StandardJavaFileManager;
import javax.tools.StandardLocation;
import javax.tools.ToolProvider;

public final class Harness {
    static final String USER_FILE = "Solution.java";
    static final String CLASS_NAME = "Solution";
    static final int STDOUT_LIMIT = 64 * 1024;
    static final String TRUNCATED = "\n[truncated]";
    static final int ERROR_LIMIT = 8 * 1024;
    static final int ACTUAL_LIMIT = 256 * 1024;
    static final long MAX_SAFE_INT = 9007199254740991L;
    static final int MAX_DEPTH = 64;
    static final int MAX_TRACE_LINES = 12;
    /**
     * Imported for the user on line 1 (no newline, so line numbers stay
     * right), like the usual judges do; the starter template imports
     * java.util.* itself as well.
     */
    static final String IMPORTS = "import java.util.*; import java.util.function.*; import java.util.stream.*; ";
    static final Pattern PACKAGE = Pattern.compile("(?m)^\\s*package\\s+[\\w.]+\\s*;");

    private Harness() {}

    // ------------------------------------------------------------ output

    /** System.out / System.err replacement target: keeps at most 64 KB of user output. */
    static final class Capture extends OutputStream {
        private final ByteArrayOutputStream pending = new ByteArrayOutputStream();
        private int used;
        private boolean truncated;
        private final int room = STDOUT_LIMIT - TRUNCATED.length();

        @Override
        public synchronized void write(int b) {
            write(new byte[] {(byte) b}, 0, 1);
        }

        @Override
        public synchronized void write(byte[] b, int off, int len) {
            if (truncated || len <= 0) return;
            if (used + len <= room) {
                pending.write(b, off, len);
                used += len;
                return;
            }
            int keep = Math.max(room - used, 0);
            // Never cut a UTF-8 sequence: drop continuation bytes at the cut.
            while (keep > 0 && keep < len && (b[off + keep] & 0xC0) == 0x80) keep--;
            pending.write(b, off, keep);
            pending.writeBytes(TRUNCATED.getBytes(StandardCharsets.UTF_8));
            used = STDOUT_LIMIT;
            truncated = true;
        }

        synchronized String take() {
            String out = pending.toString(StandardCharsets.UTF_8);
            pending.reset();
            return out;
        }
    }

    static String limit(String text, int max) {
        byte[] data = text.getBytes(StandardCharsets.UTF_8);
        if (data.length <= max) return text;
        int end = max - TRUNCATED.length();
        while (end > 0 && (data[end] & 0xC0) == 0x80) end--;
        return new String(data, 0, end, StandardCharsets.UTF_8) + TRUNCATED;
    }

    static long memoryKb() {
        // Peak resident set size of this process, in kB.
        try {
            for (String line : Files.readAllLines(Path.of("/proc/self/status"))) {
                if (line.startsWith("VmHWM:")) {
                    return Long.parseLong(line.replaceAll("[^0-9]", ""));
                }
            }
        } catch (IOException | RuntimeException ignored) {
            // fall through
        }
        return 0;
    }

    // --------------------------------------------------------------- JSON

    /** Minimal JSON reader for the payload: Map, List, String, Long, Double, Boolean, null. */
    static final class JsonReader {
        private final String s;
        private int i;

        JsonReader(String s) {
            this.s = s;
        }

        static Object parse(String text) {
            JsonReader r = new JsonReader(text);
            Object v = r.value();
            r.ws();
            if (r.i != r.s.length()) throw new IllegalArgumentException("trailing data in JSON");
            return v;
        }

        private void ws() {
            while (i < s.length()) {
                char c = s.charAt(i);
                if (c == ' ' || c == '\t' || c == '\n' || c == '\r') i++;
                else break;
            }
        }

        private Object value() {
            ws();
            if (i >= s.length()) throw new IllegalArgumentException("unexpected end of JSON");
            char c = s.charAt(i);
            switch (c) {
                case '{':
                    return object();
                case '[':
                    return array();
                case '"':
                    return string();
                case 't':
                    expect("true");
                    return Boolean.TRUE;
                case 'f':
                    expect("false");
                    return Boolean.FALSE;
                case 'n':
                    expect("null");
                    return null;
                default:
                    return number();
            }
        }

        private void expect(String word) {
            if (!s.startsWith(word, i)) throw new IllegalArgumentException("bad JSON literal");
            i += word.length();
        }

        private Map<String, Object> object() {
            Map<String, Object> out = new LinkedHashMap<>();
            i++;
            ws();
            if (s.charAt(i) == '}') {
                i++;
                return out;
            }
            while (true) {
                ws();
                String key = string();
                ws();
                if (s.charAt(i++) != ':') throw new IllegalArgumentException("expected ':' in JSON");
                out.put(key, value());
                ws();
                char c = s.charAt(i++);
                if (c == '}') return out;
                if (c != ',') throw new IllegalArgumentException("expected ',' in JSON");
            }
        }

        private List<Object> array() {
            List<Object> out = new ArrayList<>();
            i++;
            ws();
            if (s.charAt(i) == ']') {
                i++;
                return out;
            }
            while (true) {
                out.add(value());
                ws();
                char c = s.charAt(i++);
                if (c == ']') return out;
                if (c != ',') throw new IllegalArgumentException("expected ',' in JSON");
            }
        }

        private String string() {
            if (s.charAt(i) != '"') throw new IllegalArgumentException("expected a JSON string");
            i++;
            StringBuilder sb = new StringBuilder();
            while (true) {
                char c = s.charAt(i++);
                if (c == '"') return sb.toString();
                if (c != '\\') {
                    sb.append(c);
                    continue;
                }
                char e = s.charAt(i++);
                switch (e) {
                    case '"', '\\', '/' -> sb.append(e);
                    case 'b' -> sb.append('\b');
                    case 'f' -> sb.append('\f');
                    case 'n' -> sb.append('\n');
                    case 'r' -> sb.append('\r');
                    case 't' -> sb.append('\t');
                    case 'u' -> {
                        sb.append((char) Integer.parseInt(s.substring(i, i + 4), 16));
                        i += 4;
                    }
                    default -> throw new IllegalArgumentException("bad JSON escape");
                }
            }
        }

        private Object number() {
            int start = i;
            if (s.charAt(i) == '-') i++;
            boolean integral = true;
            while (i < s.length()) {
                char c = s.charAt(i);
                if (c >= '0' && c <= '9') {
                    i++;
                } else if (c == '.' || c == 'e' || c == 'E' || c == '+' || c == '-') {
                    integral = false;
                    i++;
                } else {
                    break;
                }
            }
            String text = s.substring(start, i);
            if (text.isEmpty() || text.equals("-")) throw new IllegalArgumentException("bad JSON value");
            if (integral) {
                try {
                    return Long.parseLong(text);
                } catch (NumberFormatException ignored) {
                    // beyond long: keep it as a double (the host never sends one)
                }
            }
            return Double.parseDouble(text);
        }
    }

    /** A return value that cannot be sent back: becomes the test's error text. */
    static final class ResultException extends Exception {
        ResultException(String message) {
            super(message, null, false, false);
        }
    }

    static void quote(String text, StringBuilder sb) {
        sb.append('"');
        for (int k = 0; k < text.length(); k++) {
            char c = text.charAt(k);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    // ASCII only (like Python's ensure_ascii): lone surrogates survive
                    // as \\uXXXX escapes and the host makes them storable.
                    if (c < 0x20 || c > 0x7E) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
                }
            }
        }
        sb.append('"');
    }

    static void checkSafe(long value) throws ResultException {
        if (value > MAX_SAFE_INT || value < -MAX_SAFE_INT) {
            throw new ResultException("integer result outside the range ±(2^53−1)");
        }
    }

    static void appendDouble(double d, StringBuilder sb) throws ResultException {
        if (Double.isNaN(d) || Double.isInfinite(d)) throw new ResultException("return value not JSON-serializable");
        sb.append(Double.toString(d));
    }

    /** Serializes a returned value; throws ResultException for values JSON cannot carry. */
    static void toJson(Object v, StringBuilder sb, int depth) throws ResultException {
        if (sb.length() > ACTUAL_LIMIT) throw new ResultException("return value is too large");
        if (depth > MAX_DEPTH) throw new ResultException("return value not JSON-serializable");
        if (v == null) {
            sb.append("null");
        } else if (v instanceof Boolean b) {
            sb.append(b ? "true" : "false");
        } else if (v instanceof Integer || v instanceof Long || v instanceof Short || v instanceof Byte
                || v instanceof AtomicInteger || v instanceof AtomicLong) {
            long n = ((Number) v).longValue();
            checkSafe(n);
            sb.append(n);
        } else if (v instanceof BigInteger big) {
            if (big.bitLength() > 63) throw new ResultException("integer result outside the range ±(2^53−1)");
            checkSafe(big.longValue());
            sb.append(big.longValue());
        } else if (v instanceof Double || v instanceof Float) {
            appendDouble(((Number) v).doubleValue(), sb);
        } else if (v instanceof BigDecimal dec) {
            appendDouble(dec.doubleValue(), sb);
        } else if (v instanceof String str) {
            quote(str, sb);
        } else if (v instanceof Character ch) {
            quote(String.valueOf(ch), sb);
        } else if (v instanceof char[] chars) {
            quote(new String(chars), sb);
        } else if (v.getClass().isArray()) {
            int n = Array.getLength(v);
            sb.append('[');
            for (int k = 0; k < n; k++) {
                if (k > 0) sb.append(',');
                toJson(Array.get(v, k), sb, depth + 1);
            }
            sb.append(']');
        } else if (v instanceof Iterable<?> it) {
            sb.append('[');
            boolean first = true;
            for (Object item : it) {
                if (!first) sb.append(',');
                first = false;
                toJson(item, sb, depth + 1);
                if (sb.length() > ACTUAL_LIMIT) throw new ResultException("return value is too large");
            }
            sb.append(']');
        } else {
            throw new ResultException("return value not JSON-serializable");
        }
    }

    // ------------------------------------------------------- input mapping

    /** A test input that does not fit the parameter type the user declared. */
    static final class ConvertException extends Exception {
        ConvertException(String message) {
            super(message, null, false, false);
        }
    }

    static Class<?> rawClass(Type t) {
        if (t instanceof Class<?> c) return c;
        if (t instanceof ParameterizedType p) return rawClass(p.getRawType());
        if (t instanceof GenericArrayType g) return Array.newInstance(rawClass(g.getGenericComponentType()), 0).getClass();
        if (t instanceof WildcardType w) return rawClass(w.getUpperBounds()[0]);
        return Object.class;
    }

    static String describe(Object v) {
        if (v == null) return "null";
        if (v instanceof List) return "an array";
        if (v instanceof Long) return "an integer";
        if (v instanceof Double) return "a number";
        if (v instanceof Boolean) return "a boolean";
        if (v instanceof String) return "a string";
        return "a value";
    }

    static String javaName(Type t) {
        return t.getTypeName().replace("java.lang.", "").replace("java.util.", "");
    }

    /** The natural Java value of a signature type when the declared type is Object / raw. */
    static Object natural(Object v, String sigType) {
        if (v instanceof List<?> list) {
            String inner = sigType.endsWith("[]") ? sigType.substring(0, sigType.length() - 2) : "";
            List<Object> out = new ArrayList<>(list.size());
            for (Object item : list) out.add(natural(item, inner));
            return out;
        }
        if (v instanceof Long n) {
            if (sigType.equals("float")) return n.doubleValue();
            if (n >= Integer.MIN_VALUE && n <= Integer.MAX_VALUE) return n.intValue();
            return n;
        }
        return v;
    }

    static long integral(Object v, Type target, String where) throws ConvertException {
        if (v instanceof Long n) return n;
        if (v instanceof Double d && d == Math.rint(d) && !Double.isInfinite(d)) return d.longValue();
        throw mismatch(v, target, where);
    }

    static ConvertException mismatch(Object v, Type target, String where) {
        return new ConvertException(where + ": " + describe(v) + " cannot be passed as " + javaName(target));
    }

    static Object convert(Object v, Type target, String sigType, String where) throws ConvertException {
        Class<?> raw = rawClass(target);
        if (v == null) {
            if (raw.isPrimitive()) throw mismatch(null, target, where);
            return null;
        }
        if (raw == int.class || raw == Integer.class) {
            long n = integral(v, target, where);
            if (n < Integer.MIN_VALUE || n > Integer.MAX_VALUE) {
                throw new ConvertException(where + ": " + n + " does not fit in a Java int; declare it as long");
            }
            return (int) n;
        }
        if (raw == long.class || raw == Long.class) return integral(v, target, where);
        if (raw == double.class || raw == Double.class || raw == float.class || raw == Float.class) {
            if (!(v instanceof Number num)) throw mismatch(v, target, where);
            double d = num.doubleValue();
            return raw == float.class || raw == Float.class ? (Object) (float) d : (Object) d;
        }
        if (raw == boolean.class || raw == Boolean.class) {
            if (!(v instanceof Boolean)) throw mismatch(v, target, where);
            return v;
        }
        if (raw == String.class || raw == CharSequence.class) {
            if (!(v instanceof String)) throw mismatch(v, target, where);
            return v;
        }
        if (raw == char[].class && v instanceof String str) return str.toCharArray();
        if (raw == char.class || raw == Character.class) {
            if (!(v instanceof String str) || str.length() != 1) throw mismatch(v, target, where);
            return str.charAt(0);
        }
        String inner = sigType.endsWith("[]") ? sigType.substring(0, sigType.length() - 2) : "";
        if (raw.isArray()) {
            if (!(v instanceof List<?> list)) throw mismatch(v, target, where);
            Type component = target instanceof GenericArrayType g ? g.getGenericComponentType() : raw.getComponentType();
            Object out = Array.newInstance(rawClass(component), list.size());
            for (int k = 0; k < list.size(); k++) {
                Array.set(out, k, convert(list.get(k), component, inner, where + "[" + k + "]"));
            }
            return out;
        }
        if (raw.isAssignableFrom(ArrayList.class)) {
            if (!(v instanceof List<?> list)) {
                if (raw == Object.class || raw == Number.class || raw == Comparable.class) return natural(v, sigType);
                throw mismatch(v, target, where);
            }
            Type element = Object.class;
            if (target instanceof ParameterizedType p && p.getActualTypeArguments().length == 1) {
                element = p.getActualTypeArguments()[0];
            }
            List<Object> out = new ArrayList<>(list.size());
            for (int k = 0; k < list.size(); k++) {
                out.add(convert(list.get(k), element, inner, where + "[" + k + "]"));
            }
            return out;
        }
        if (raw.isInstance(natural(v, sigType))) return natural(v, sigType);
        throw mismatch(v, target, where);
    }

    // ---------------------------------------------------- compile in memory

    static final class Source extends SimpleJavaFileObject {
        private final String text;

        Source(String text) {
            super(URI.create("string:///" + USER_FILE), Kind.SOURCE);
            this.text = text;
        }

        @Override
        public CharSequence getCharContent(boolean ignoreEncodingErrors) {
            return text;
        }
    }

    static final class ClassOutput extends SimpleJavaFileObject {
        final ByteArrayOutputStream bytes = new ByteArrayOutputStream();

        ClassOutput(String name) {
            super(URI.create("mem:///" + name.replace('.', '/') + Kind.CLASS.extension), Kind.CLASS);
        }

        @Override
        public OutputStream openOutputStream() {
            return bytes;
        }
    }

    static final class MemoryFileManager extends ForwardingJavaFileManager<StandardJavaFileManager> {
        final Map<String, ClassOutput> outputs = new HashMap<>();

        MemoryFileManager(StandardJavaFileManager fm) {
            super(fm);
        }

        @Override
        public JavaFileObject getJavaFileForOutput(
                JavaFileManager.Location location, String className, JavaFileObject.Kind kind, FileObject sibling) {
            ClassOutput out = new ClassOutput(className);
            outputs.put(className, out);
            return out;
        }
    }

    static final class SolutionLoader extends ClassLoader {
        private final Map<String, byte[]> classes;

        SolutionLoader(Map<String, byte[]> classes) {
            // Parent: the platform loader, so user code cannot see the harness.
            super("solution", ClassLoader.getPlatformClassLoader());
            this.classes = classes;
        }

        @Override
        protected Class<?> findClass(String name) throws ClassNotFoundException {
            byte[] b = classes.get(name);
            if (b == null) throw new ClassNotFoundException(name);
            return defineClass(name, b, 0, b.length);
        }
    }

    /** javac-style text for the error diagnostics, positions in the user's own code. */
    static String formatDiagnostics(List<Diagnostic<? extends JavaFileObject>> diagnostics, String code) {
        String[] lines = code.split("\n", -1);
        StringBuilder sb = new StringBuilder();
        int errors = 0;
        for (Diagnostic<? extends JavaFileObject> d : diagnostics) {
            if (d.getKind() != Diagnostic.Kind.ERROR) continue;
            errors++;
            String[] message = d.getMessage(Locale.ROOT).split("\n");
            long line = d.getLineNumber();
            long column = d.getColumnNumber();
            if (line == 1 && column > 0) column = Math.max(1, column - IMPORTS.length());
            sb.append(line > 0 ? USER_FILE + ":" + line + ": error: " : USER_FILE + ": error: ").append(message[0]).append('\n');
            if (line > 0 && line <= lines.length) {
                String src = lines[(int) line - 1].replace("\r", "");
                sb.append(src).append('\n');
                if (column > 0 && column <= src.length() + 1) {
                    StringBuilder caret = new StringBuilder();
                    for (int k = 1; k < column; k++) caret.append(src.charAt(k - 1) == '\t' ? '\t' : ' ');
                    sb.append(caret).append("^\n");
                }
            }
            for (int k = 1; k < message.length; k++) sb.append(message[k]).append('\n');
        }
        if (errors == 0) return "compilation failed";
        sb.append(errors).append(errors == 1 ? " error" : " errors");
        return sb.toString();
    }

    // --------------------------------------------------------------- errors

    static boolean isUserFrame(StackTraceElement e) {
        return USER_FILE.equals(e.getFileName());
    }

    /** Exception text with stack frames of the user's Solution.java only. */
    static String formatError(Throwable t) {
        StringBuilder sb = new StringBuilder();
        Throwable current = t;
        int guard = 0;
        while (current != null && guard++ < 5) {
            if (current != t) sb.append("Caused by: ");
            sb.append(current.toString().replace("solution//", "")).append('\n');
            int shown = 0;
            int hidden = 0;
            for (StackTraceElement e : current.getStackTrace()) {
                if (!isUserFrame(e)) continue;
                if (shown < MAX_TRACE_LINES) {
                    sb.append("\tat ").append(e.getClassName()).append('.').append(e.getMethodName())
                            .append('(').append(USER_FILE).append(':').append(e.getLineNumber()).append(")\n");
                    shown++;
                } else {
                    hidden++;
                }
            }
            if (hidden > 0) sb.append("\t... ").append(hidden).append(" more\n");
            current = current.getCause() == current ? null : current.getCause();
        }
        String text = sb.toString().replace("/sandbox/", "").stripTrailing();
        return limit(text, ERROR_LIMIT);
    }

    // ------------------------------------------------------------ running

    /** One unit of user code run in its own thread under the time limit. */
    static final class Task implements Runnable {
        interface Body {
            Object run(Task task) throws Throwable;
        }

        private final Body body;
        volatile long startedNanos;
        volatile long elapsedNanos = -1;
        volatile Object result;
        volatile Throwable error;
        volatile boolean finished;

        Task(Body body) {
            this.body = body;
        }

        @Override
        public void run() {
            try {
                result = body.run(this);
            } catch (InvocationTargetException e) {
                error = e.getCause() != null ? e.getCause() : e;
            } catch (Throwable e) {
                error = e;
            } finally {
                finished = true;
            }
        }
    }

    /** Runs `task` in a new thread; returns false when it did not finish within the limit. */
    static boolean runLimited(Task task, long timeLimitMs, long stackBytes) throws InterruptedException {
        Thread thread = new Thread(null, task, "solution", stackBytes);
        thread.setDaemon(true);
        long started = System.nanoTime();
        thread.start();
        long deadline = started + timeLimitMs * 1_000_000L;
        while (!task.finished) {
            long left = deadline - System.nanoTime();
            if (left <= 0) break;
            thread.join(Math.max(1, left / 1_000_000L), (int) (left % 1_000_000L));
        }
        return task.finished;
    }

    // ----------------------------------------------------------------- main

    static String readLine(InputStream in) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] chunk = new byte[65536];
        while (true) {
            int n = in.read(chunk);
            if (n < 0) break;
            int nl = -1;
            for (int k = 0; k < n; k++) {
                if (chunk[k] == '\n') {
                    nl = k;
                    break;
                }
            }
            if (nl >= 0) {
                buf.write(chunk, 0, nl);
                break;
            }
            buf.write(chunk, 0, n);
        }
        return buf.toString(StandardCharsets.UTF_8);
    }

    /**
     * Every way out ends the JVM with halt(): user code may have started
     * non-daemon threads or shutdown hooks, and none of them may delay the
     * exit. A crash of the runner itself (e.g. out of memory outside a test)
     * writes "runner: <class>" to stderr; exit code 3 means out of memory
     * (worker/judge.ts maps it to Memory Limit).
     */
    public static void main(String[] argv) {
        int code = 0;
        try {
            run();
        } catch (Throwable error) {
            code = error instanceof OutOfMemoryError ? 3 : 1;
            try {
                FileOutputStream err = new FileOutputStream(FileDescriptor.err);
                err.write(("runner: " + error.getClass().getName() + "\n").getBytes(StandardCharsets.UTF_8));
            } catch (IOException | RuntimeException ignored) {
                // nothing left to do
            }
        }
        // The image build's training run (-Druntime.training=true) must exit
        // normally so the JVM writes its AOT cache.
        if (code == 0 && Boolean.getBoolean("runtime.training")) System.exit(0);
        Runtime.getRuntime().halt(code);
    }

    @SuppressWarnings("unchecked")
    static void run() throws Exception {
        final FileOutputStream realOut = new FileOutputStream(FileDescriptor.out);
        // Vercel Sandbox (worker/vercel-sandbox-executor.ts) passes the payload
        // as a file, read once and deleted; Docker sends it on stdin.
        String payloadFile = System.getProperty("runtime.payload");
        String line;
        if (payloadFile != null) {
            Path payloadPath = Path.of(payloadFile);
            try (InputStream in = Files.newInputStream(payloadPath)) {
                line = readLine(in);
            }
            try {
                Files.deleteIfExists(payloadPath);
            } catch (IOException | RuntimeException ignored) {
                // a read-only or special file (e.g. /dev/stdin in tests) stays
            }
        } else {
            line = readLine(new FileInputStream(FileDescriptor.in));
        }
        Map<String, Object> payload = (Map<String, Object>) JsonReader.parse(line);
        line = null;
        final byte[] prefix = ("\n@@" + payload.remove("nonce") + "@@").getBytes(StandardCharsets.UTF_8);
        final String code = (String) payload.get("code");
        Map<String, Object> signature = (Map<String, Object>) payload.get("signature");
        List<Object> tests = (List<Object>) payload.get("tests");
        long timeLimitMs = Math.max(1, Math.round(((Number) payload.get("timeLimitMs")).doubleValue()));
        boolean stopOnError = Boolean.TRUE.equals(payload.get("stopOnError"));
        payload = null;
        long stackBytes = Long.getLong("solution.stackMb", 64L) * 1024L * 1024L;

        final Capture capture = new Capture();
        final Object emitLock = new Object();
        // Writes one frame to the real fd 1. `fields` is already-serialized JSON members.
        java.util.function.Consumer<StringBuilder> emit = (fields) -> {
            synchronized (emitLock) {
                StringBuilder sb = new StringBuilder("{");
                sb.append(fields).append(",\"stdout\":");
                quote(capture.take(), sb);
                sb.append(",\"memoryKb\":").append(memoryKb()).append('}');
                byte[] body = sb.toString().getBytes(StandardCharsets.UTF_8);
                try {
                    realOut.write(prefix);
                    realOut.write(body);
                    realOut.write('\n');
                } catch (IOException e) {
                    Runtime.getRuntime().halt(1);
                }
            }
        };

        // 1. Compile in memory. Errors here are compile errors, before any test.
        if (PACKAGE.matcher(code).find()) {
            StringBuilder f = new StringBuilder("\"kind\":\"compile_error\",\"error\":");
            quote(USER_FILE + ": error: remove the package declaration (Solution must be in the default package)", f);
            emit.accept(f);
            return;
        }
        Map<String, byte[]> classes = new HashMap<>();
        {
            JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
            DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
            StandardJavaFileManager standard = compiler.getStandardFileManager(diagnostics, Locale.ROOT, StandardCharsets.UTF_8);
            // Nothing on the class path: user code sees the JDK only, never this runner.
            standard.setLocation(StandardLocation.CLASS_PATH, List.of());
            MemoryFileManager fm = new MemoryFileManager(standard);
            List<String> options = List.of("-proc:none", "-implicit:none", "-nowarn", "-Xlint:none", "-g:source,lines",
                    "-encoding", "UTF-8", "-Xmaxerrs", "20");
            boolean ok;
            try {
                ok = compiler.getTask(null, fm, diagnostics, options, null, List.of(new Source(IMPORTS + code))).call();
            } catch (RuntimeException e) {
                ok = false;
            }
            if (!ok) {
                StringBuilder f = new StringBuilder("\"kind\":\"compile_error\",\"error\":");
                quote(limit(formatDiagnostics(diagnostics.getDiagnostics(), code), ERROR_LIMIT), f);
                emit.accept(f);
                return;
            }
            for (Map.Entry<String, ClassOutput> e : fm.outputs.entrySet()) classes.put(e.getKey(), e.getValue().bytes.toByteArray());
            fm.close();
        }

        // User output goes to the capture buffer, never to the frame stream.
        PrintStream captured = new PrintStream(capture, true, StandardCharsets.UTF_8);
        System.setOut(captured);
        System.setErr(captured);
        System.setIn(InputStream.nullInputStream());

        String name = (String) signature.get("name");
        List<Object> params = (List<Object>) signature.get("params");
        String notFound = "function " + name + " not found";
        SolutionLoader loader = new SolutionLoader(classes);

        // 2. Load and initialize Solution (static initializers) under the time limit.
        Class<?> cls;
        try {
            cls = loader.loadClass(CLASS_NAME);
        } catch (ClassNotFoundException | LinkageError e) {
            StringBuilder f = new StringBuilder("\"kind\":\"fatal\",\"status\":\"error\",\"error\":");
            quote(notFound, f);
            emit.accept(f);
            return;
        }
        final Class<?> solution = cls;
        Task init = new Task((t) -> Class.forName(CLASS_NAME, true, loader));
        if (!runLimited(init, timeLimitMs, stackBytes)) {
            emit.accept(new StringBuilder("\"kind\":\"fatal\",\"status\":\"timeout\",\"error\":\"Time limit exceeded\""));
            realOut.flush();
            Runtime.getRuntime().halt(0);
        }
        if (init.error != null) {
            Throwable cause = init.error instanceof ExceptionInInitializerError ei && ei.getCause() != null ? ei.getCause() : init.error;
            StringBuilder f = new StringBuilder("\"kind\":\"fatal\",\"status\":\"error\",\"error\":");
            quote(formatError(cause), f);
            emit.accept(f);
            return;
        }

        // 3. Find the method: name and parameter count (declared first, then inherited public).
        List<Method> candidates = new ArrayList<>();
        for (Method m : solution.getDeclaredMethods()) {
            if (m.getName().equals(name) && m.getParameterCount() == params.size() && !m.isSynthetic() && !m.isBridge()) {
                candidates.add(m);
            }
        }
        if (candidates.isEmpty()) {
            for (Method m : solution.getMethods()) {
                if (m.getName().equals(name) && m.getParameterCount() == params.size()) candidates.add(m);
            }
        }
        if (candidates.size() != 1) {
            StringBuilder f = new StringBuilder("\"kind\":\"fatal\",\"status\":\"error\",\"error\":");
            quote(candidates.isEmpty() ? notFound : "function " + name + " is overloaded; keep one method with "
                    + params.size() + " parameter(s)", f);
            emit.accept(f);
            return;
        }
        final Method method = candidates.get(0);
        final boolean isStatic = Modifier.isStatic(method.getModifiers());
        Constructor<?> ctor = null;
        try {
            method.setAccessible(true);
            if (!isStatic) {
                ctor = solution.getDeclaredConstructor();
                ctor.setAccessible(true);
            }
        } catch (NoSuchMethodException | RuntimeException e) {
            StringBuilder f = new StringBuilder("\"kind\":\"fatal\",\"status\":\"error\",\"error\":");
            quote("class Solution needs a constructor without parameters", f);
            emit.accept(f);
            return;
        }
        final Constructor<?> constructor = ctor;
        Type[] declared = method.getGenericParameterTypes();

        // 4. Tests, one frame each.
        for (int index = 0; index < tests.size(); index++) {
            Map<String, Object> input = (Map<String, Object>) ((Map<String, Object>) tests.get(index)).get("input");
            StringBuilder frame = new StringBuilder("\"kind\":\"test\",\"index\":").append(index);
            Object[] args = new Object[params.size()];
            String convertError = null;
            for (int k = 0; k < args.length; k++) {
                Map<String, Object> p = (Map<String, Object>) params.get(k);
                String pname = (String) p.get("name");
                try {
                    args[k] = convert(input.get(pname), declared[k], (String) p.get("type"), "parameter " + pname);
                } catch (ConvertException e) {
                    convertError = e.getMessage();
                    break;
                } catch (OutOfMemoryError e) {
                    convertError = "java.lang.OutOfMemoryError: the input does not fit in memory";
                    break;
                }
            }
            if (convertError != null) {
                frame.append(",\"status\":\"error\",\"timeMs\":0,\"error\":");
                quote(convertError, frame);
                emit.accept(frame);
                if (stopOnError) return;
                continue;
            }

            final Object[] callArgs = args;
            Task task = new Task((t) -> {
                long started = System.nanoTime();
                t.startedNanos = started;
                Object target = isStatic ? null : constructor.newInstance();
                Object value = method.invoke(target, callArgs);
                t.elapsedNanos = System.nanoTime() - started;
                StringBuilder json = new StringBuilder();
                toJson(value, json, 0);
                if (json.length() > ACTUAL_LIMIT) throw new ResultException("return value is too large");
                return json.toString();
            });
            long started = System.nanoTime();
            boolean finished = runLimited(task, timeLimitMs, stackBytes);
            long elapsed = task.elapsedNanos >= 0 ? task.elapsedNanos : System.nanoTime() - started;
            frame.append(",\"timeMs\":").append(elapsed / 1_000_000.0);
            if (!finished) {
                frame.append(",\"status\":\"timeout\"");
                emit.accept(frame);
                realOut.flush();
                // A thread cannot be stopped: end the process (no more tests run after a timeout).
                Runtime.getRuntime().halt(0);
            }
            Throwable error = task.error;
            boolean failed = error != null;
            if (error instanceof ResultException) {
                frame.append(",\"status\":\"error\",\"error\":");
                quote(error.getMessage(), frame);
            } else if (error instanceof OutOfMemoryError) {
                frame.append(",\"status\":\"error\",\"memory\":true,\"error\":");
                quote(formatError(error), frame);
            } else if (error != null) {
                frame.append(",\"status\":\"error\",\"error\":");
                quote(formatError(error), frame);
            } else {
                frame.append(",\"status\":\"ok\",\"actual\":").append((String) task.result);
            }
            emit.accept(frame);
            if (failed && stopOnError) {
                realOut.flush();
                Runtime.getRuntime().halt(0);
            }
        }

        emit.accept(new StringBuilder("\"kind\":\"done\""));
    }

    static {
        // Threads started by the solution: an uncaught exception goes to the
        // captured output (System.err), in the same cleaned form as test errors.
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            try {
                System.err.println("Exception in thread \"" + thread.getName() + "\" " + formatError(error));
            } catch (Throwable ignored) {
                // nothing left to do
            }
        });
    }
}
