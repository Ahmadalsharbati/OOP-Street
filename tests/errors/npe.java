// EXPECT: java.lang.NullPointerException: Cannot invoke "Etudiant.getNom()" because "jean" is null
class Etudiant {
    private String nom;
    public Etudiant(String nom) { this.nom = nom; }
    public String getNom() { return nom; }
}
public class Launcher {
    public static void main(String[] args) {
        Etudiant jean = new Etudiant("Jean");
        jean = null;
        System.out.println(jean.getNom());
    }
}
