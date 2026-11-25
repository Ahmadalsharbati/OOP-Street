// EXPECT: jean cannot be resolved to a variable
// LINE: 7
class Etudiant {
}
public class Launcher {
    public static void main(String[] args) {
        System.out.println(jean);
        Etudiant jean = new Etudiant();
    }
}
