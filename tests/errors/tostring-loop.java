// EXPECT: java.lang.StackOverflowError
class Etudiant {
    String nom = "Jean";
    Classe classe;
    public String toString() { return nom + " " + classe; }
}
class Classe {
    Etudiant e;
    public String toString() { return "CDA " + e; }
}
public class Launcher {
    public static void main(String[] args) {
        Etudiant j = new Etudiant();
        Classe c = new Classe();
        j.classe = c;
        c.e = j;
        System.out.println(j);
    }
}
