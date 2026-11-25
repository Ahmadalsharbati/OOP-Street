// EXPECT: The final field Compte.numero cannot be assigned
class Compte {
    private final int numero;
    public Compte(int n) { numero = n; }
    public void changer() { numero = 3; }
}
public class Launcher {
    public static void main(String[] args) {
        new Compte(1).changer();
    }
}
