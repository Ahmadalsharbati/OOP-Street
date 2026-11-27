// EXPECT: The type Chat must implement the inherited abstract method Animal.crier()
abstract class Animal {
    public abstract String crier();
}
class Chat extends Animal {
}
public class Launcher {
    public static void main(String[] args) {
        Chat c = new Chat();
    }
}
