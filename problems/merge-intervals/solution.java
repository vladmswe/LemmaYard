import java.util.*;

class Solution {
    public int[][] merge(int[][] intervals) {
        int[][] sorted = intervals.clone();
        Arrays.sort(sorted, (a, b) -> a[0] != b[0] ? Integer.compare(a[0], b[0]) : Integer.compare(a[1], b[1]));
        List<int[]> result = new ArrayList<>();
        for (int[] interval : sorted) {
            int[] last = result.isEmpty() ? null : result.get(result.size() - 1);
            if (last != null && interval[0] <= last[1]) {
                last[1] = Math.max(last[1], interval[1]);
            } else {
                result.add(new int[] {interval[0], interval[1]});
            }
        }
        return result.toArray(new int[0][]);
    }
}
