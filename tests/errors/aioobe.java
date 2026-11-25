// EXPECT: java.lang.ArrayIndexOutOfBoundsException: Index 3 out of bounds for length 3
public class Launcher {
    public static void main(String[] args) {
        int[] t = new int[3];
        for (int i = 0; i <= t.length; i++) t[i] = i;
    }
}
