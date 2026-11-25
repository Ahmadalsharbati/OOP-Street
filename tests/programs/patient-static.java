class Patient {
    private static int compteur = 0;
    private final int id;
    private String nom;
    private double poids;
    private double taille;

    public Patient(String nom, double poids, double taille) {
        compteur++;
        this.id = compteur;
        this.nom = nom;
        setPoids(poids);
        this.taille = taille;
    }

    public Patient(String nom) {
        this(nom, 70, 1.75);
    }

    public void setPoids(double poids) {
        if (poids <= 0) {
            System.out.println("Poids invalide");
            return;
        }
        this.poids = poids;
    }

    public double calculerImc() {
        return poids / (taille * taille);
    }

    public String getCategorie() {
        double imc = calculerImc();
        if (imc < 18.5) return "maigreur";
        else if (imc < 25) return "normal";
        else return "surpoids";
    }

    public static int getCompteur() { return compteur; }

    public String toString() {
        return "Patient#" + id + " " + nom + " imc=" + String.format("%.1f", calculerImc()) + " " + getCategorie();
    }
}

public class Launcher {
    static int fact(int n) {
        if (n <= 1) return 1;
        return n * fact(n - 1);
    }
    public static void main(String[] args) {
        Patient p1 = new Patient("Ali", 90, 1.80);
        Patient p2 = new Patient("Lina");
        Patient p3 = new Patient("Sam", -5, 1.60);
        System.out.println(p1);
        System.out.println(p2);
        System.out.println(p3);
        System.out.println(Patient.getCompteur());
        System.out.println(fact(10));
        Patient[] liste = new Patient[3];
        liste[0] = p1;
        System.out.println(liste[0] == p1);
        System.out.println(liste[2]);
        Object o = p2;
        System.out.println(o instanceof Patient);
        String texte = "Bonjour le monde";
        String[] mots = texte.split(" ");
        for (String m : mots) System.out.println(m.toUpperCase() + m.length());
        System.out.println(Integer.parseInt("42") + 1);
        System.out.println("a".compareTo("c") + " " + "abc".contains("bc"));
    }
}
