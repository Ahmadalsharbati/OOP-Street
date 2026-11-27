class Forme {
    private String couleur;
    private boolean remplie;

    public Forme() {
        this("noir", false);
    }

    public Forme(String couleur, boolean remplie) {
        this.couleur = couleur;
        this.remplie = remplie;
    }

    public String getCouleur() { return couleur; }
    public boolean isRemplie() { return remplie; }

    public double calculerPerimetre() {
        return 0;
    }

    @Override
    public String toString() {
        return "couleur=" + couleur + ", remplie=" + remplie;
    }
}

class Carre extends Forme {
    private double cote;

    public Carre(double cote) {
        this.cote = cote;
    }

    @Override
    public double calculerPerimetre() {
        return 4 * cote;
    }

    @Override
    public String toString() {
        return "Carre [cote=" + cote + ", " + super.toString() + "]";
    }
}

class Triangle extends Forme {
    protected double a, b, c;

    public Triangle(String couleur, double a, double b, double c) {
        super(couleur, true);
        this.a = a;
        this.b = b;
        this.c = c;
    }

    @Override
    public double calculerPerimetre() {
        return a + b + c;
    }
}

public class Launcher {
    public static void main(String[] args) {
        Forme[] formes = new Forme[3];
        formes[0] = new Carre(2.5);
        formes[1] = new Triangle("vert", 3, 4, 5);
        formes[2] = new Forme();
        double total = 0;
        for (Forme f : formes) {
            System.out.println(f + " -> " + f.calculerPerimetre());
            total += f.calculerPerimetre();
        }
        System.out.println("total = " + total);
        System.out.println(formes[1].getCouleur() + " " + formes[1].isRemplie());
    }
}
