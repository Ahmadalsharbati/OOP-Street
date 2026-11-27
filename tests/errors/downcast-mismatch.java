// EXPECT: Type mismatch: cannot convert from Animal to Chien
class Animal {
}
class Chien extends Animal {
}
public class Launcher {
    public static void main(String[] args) {
        Animal a = new Chien();
        Chien c = a;
    }
}
