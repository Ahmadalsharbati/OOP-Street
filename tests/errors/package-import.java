// EXPECT: Etudiant cannot be resolved to a type
package fr.eni.bo;
public class Etudiant {
    public String nom = "x";
}
package fr.eni.ihm;
public class Launcher {
    public static void main(String[] args) {
        Etudiant e = new Etudiant();
    }
}
