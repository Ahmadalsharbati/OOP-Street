// EXPECT: The method aboyer() is undefined for the type Animal
class Animal {
}
class Chien extends Animal {
    public void aboyer() { System.out.println("Wouf"); }
}
public class Launcher {
    public static void main(String[] args) {
        Animal a = new Chien();
        a.aboyer();
    }
}
