# Java sandbox image (PLAN.md section 5). Build with `pnpm sandbox:build`.
# Bases pinned by tag and multi-arch digest.
#
# Stage 1: a trimmed Java 25 runtime (java.base + the in-process compiler
# jdk.compiler, nothing else) and the compiled runner.
FROM eclipse-temurin:25-jdk-alpine@sha256:3fd2d245c4e0eba615fe366a71b8bd25f5db7104f53e4026b24bf508b880bd2a AS build
RUN jlink --add-modules java.base,jdk.compiler \
      --strip-debug --no-man-pages --no-header-files --output /opt/jre
COPY Harness.java /build/Harness.java
RUN javac --release 25 -d /build/classes /build/Harness.java \
 && jar --create --file /build/harness.jar -C /build/classes .

# Stage 2: the runtime image.
FROM alpine:3.22@sha256:5291449c3df73caf6ed85e649dec1b9e818b39a5d8c871e97afc13e9cd5e8fa8
COPY --from=build /opt/jre /opt/jre
COPY --from=build --chown=0:0 --chmod=0444 /build/harness.jar /sandbox/harness.jar
# The source too: Vercel Sandbox runs it in single-file source mode (worker/
# vercel-sandbox-executor.ts, VM_LANGUAGES.java) when this image is the VCR image.
COPY --chown=0:0 --chmod=0444 Harness.java /sandbox/Harness.java
COPY --chown=0:0 --chmod=0444 java-train.json /build/java-train.json
# AOT cache (JDK 25, JEP 514/515): one training run of the runner compiling and
# judging a small solution, so the JVM and javac classes start pre-loaded and
# pre-linked. Same JVM flags as at run time (worker/docker-executor.ts,
# JAVA_JVM_FLAGS); without a matching cache the JVM just starts slower.
RUN /opt/jre/bin/java -XX:+UseSerialGC -Druntime.training=true \
      -XX:AOTCacheOutput=/sandbox/harness.aot -cp /sandbox/harness.jar Harness \
      < /build/java-train.json > /dev/null \
 && chmod 0444 /sandbox/harness.aot && chmod 0555 /sandbox && rm -rf /build

ENV PATH=/opt/jre/bin:$PATH
WORKDIR /tmp
USER 65534:65534
# The worker passes this command explicitly, with -Xmx and the solution
# thread's stack size derived from the problem's memory limit
# (worker/docker-executor.ts).
CMD ["java", "-XX:AOTCache=/sandbox/harness.aot", "-cp", "/sandbox/harness.jar", "Harness"]
