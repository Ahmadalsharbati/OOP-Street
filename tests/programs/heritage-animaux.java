abstract class Animal {
    protected String nom;
    private int age;
    private static int nbAnimaux = 0;

    public Animal(String nom, int age) {
        this.nom = nom;
        this.age = age;
        nbAnimaux++;
    }

    public abstract String crier();

    // late binding: crier() is the one of the real object
    public String presenter() {
        return nom + " (" + age + " ans) dit " + crier();
    }

    public int getAge() {
        return age;
    }

    public static int getNbAnimaux() {
        return nbAnimaux;
    }

    @Override
    public String toString() {
        return "Animal " + nom;
    }
}

class Chien extends Animal {
    private String race;

    public Chien(String nom, int age, String race) {
        super(nom, age);
        this.race = race;
    }

    @Override
    public String crier() {
        return "Wouf";
    }

    public String chercherBalle() {
        return nom + " rapporte la balle";
    }

    @Override
    public String toString() {
        return super.toString() + " [chien " + race + "]";
    }
}

class Chat extends Animal {
    public Chat(String nom, int age) {
        super(nom, age);
    }

    @Override
    public String crier() {
        return "Miaou";
    }
}

class Chaton extends Chat {
    public Chaton(String nom) {
        super(nom, 0);
    }

    @Override
    public String crier() {
        return "miaou (tout petit) puis " + super.crier();
    }
}

public class Launcher {
    public static void main(String[] args) {
        Chien rex = new Chien("Rex", 5, "berger");
        Chat tom = new Chat("Tom", 3);
        Animal mini = new Chaton("Mini");

        Animal[] animaux = { rex, tom, mini };
        for (Animal a : animaux) {
            System.out.println(a.presenter());
            System.out.println(a);
        }

        System.out.println(rex.chercherBalle());
        System.out.println(rex.getAge() + tom.getAge());
        System.out.println(Animal.getNbAnimaux());

        for (int i = 0; i < animaux.length; i++) {
            if (animaux[i] instanceof Chien) {
                Chien c = (Chien) animaux[i];
                System.out.println("Chien trouve : " + c.chercherBalle());
            } else if (animaux[i] instanceof Chat) {
                System.out.println(animaux[i].crier() + " est un chat");
            }
        }
        System.out.println(mini instanceof Animal);
        System.out.println(tom instanceof Chaton);
        Animal a2 = rex;
        System.out.println(a2 == rex);
    }
}
