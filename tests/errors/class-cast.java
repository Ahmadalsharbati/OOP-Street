// EXPECT: java.lang.ClassCastException: class Chat cannot be cast to class Chien (Chat and Chien are in unnamed module of loader 'app')
class Animal {
}
class Chien extends Animal {
}
class Chat extends Animal {
}
public class Launcher {
    public static void main(String[] args) {
        Animal a = new Chat();
        Chien c = (Chien) a;
    }
}
