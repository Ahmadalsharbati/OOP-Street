// EXPECT: The field Animal.nom is not visible
class Animal {
    private String nom;
    public Animal(String nom) { this.nom = nom; }
}
class Chien extends Animal {
    public Chien(String nom) { super(nom); }
    public String getNom() { return nom; }
}
public class Launcher {
    public static void main(String[] args) {
        Chien c = new Chien("Rex");
        System.out.println(c.getNom());
    }
}
