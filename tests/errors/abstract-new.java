// EXPECT: Cannot instantiate the type Animal
abstract class Animal {
    public abstract String crier();
}
public class Launcher {
    public static void main(String[] args) {
        Animal a = new Animal();
    }
}
