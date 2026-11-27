// EXPECT: Implicit super constructor Animal() is undefined. Must explicitly invoke another constructor
class Animal {
    protected String nom;
    public Animal(String nom) { this.nom = nom; }
}
class Chien extends Animal {
    public Chien(String nom) {
        this.nom = nom;
    }
}
public class Launcher {
    public static void main(String[] args) {
        Chien c = new Chien("Rex");
    }
}
