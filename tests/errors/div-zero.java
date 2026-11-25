// EXPECT: java.lang.ArithmeticException: / by zero
public class Launcher {
    static int moyenne(int total, int n) { return total / n; }
    public static void main(String[] args) {
        System.out.println(moyenne(10, 0));
    }
}
