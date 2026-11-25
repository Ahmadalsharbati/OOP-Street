// EXPECT: This method must return a result of type int
public class Launcher {
    static int signe(int n) {
        if (n > 0) return 1;
        else if (n < 0) return -1;
    }
    public static void main(String[] args) {
        System.out.println(signe(4));
    }
}
