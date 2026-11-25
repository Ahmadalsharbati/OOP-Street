// EXPECT: Cannot make a static reference to the non-static method getNom() from the type Etudiant
class Etudiant {
    private String nom;
    public String getNom() { return nom; }
}
public class Launcher {
    public static void main(String[] args) {
        System.out.println(Etudiant.getNom());
    }
}
