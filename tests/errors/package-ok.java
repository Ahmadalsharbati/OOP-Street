// EXPECT-OUT: x fr.eni.bo.Etudiant@
package fr.eni.bo;
public class Etudiant {
    public String nom = "x";
}
package fr.eni.ihm;
import fr.eni.bo.Etudiant;
public class Launcher {
    public static void main(String[] args) {
        Etudiant e = new Etudiant();
        System.out.println(e.nom + " " + e);
    }
}
