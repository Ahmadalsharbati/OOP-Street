// EXPECT: The constructor Etudiant() is undefined
class Etudiant {
    private String nom;
    public Etudiant(String nom) { this.nom = nom; }
}
public class Launcher {
    public static void main(String[] args) {
        Etudiant e = new Etudiant();
    }
}
