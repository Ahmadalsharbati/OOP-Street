// EXPECT: The field Etudiant.nom is not visible
// LINE: 10
class Etudiant {
    private String nom;
    public Etudiant(String nom) { this.nom = nom; }
}
public class Launcher {
    public static void main(String[] args) {
        Etudiant jean = new Etudiant("Jean");
        System.out.println(jean.nom);
    }
}
