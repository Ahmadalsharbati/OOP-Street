class Piece {
    private String nom;
    private double surface;

    public Piece(String nom, double surface) {
        this.nom = nom;
        this.surface = surface;
    }

    public double getSurface() {
        return surface;
    }

    public String toString() {
        return nom + " " + surface + " m2";
    }
}

class Proprietaire {
    private String nom;

    public Proprietaire(String nom) {
        this.nom = nom;
    }

    public String getNom() {
        return nom;
    }
}

class Maison {
    private String adresse;
    private Piece[] pieces = new Piece[3];
    private int nb;
    private Proprietaire proprietaire;

    public Maison(String adresse) {
        this.adresse = adresse;
    }

    // composition: the house creates its own rooms
    public void ajouterPiece(String nom, double surface) {
        if (nb < pieces.length) {
            pieces[nb] = new Piece(nom, surface);
            nb++;
        }
    }

    // agregation: the owner exists outside the house
    public void setProprietaire(Proprietaire proprietaire) {
        this.proprietaire = proprietaire;
    }

    public double surfaceTotale() {
        double total = 0;
        for (int i = 0; i < nb; i++) {
            total = total + pieces[i].getSurface();
        }
        return total;
    }
}

public class Launcher {
    public static void main(String[] args) {
        Proprietaire ali = new Proprietaire("Ali");
        Maison m = new Maison("12 rue de Rennes");
        m.ajouterPiece("Salon", 25.5);
        m.ajouterPiece("Cuisine", 12.0);
        m.ajouterPiece("Chambre", 14.5);
        m.setProprietaire(ali);
        System.out.println("Surface : " + m.surfaceTotale());
        System.out.println("Proprietaire : " + ali.getNom());
        m = null;
        System.out.println("The house is gone, its rooms too. Ali is still here: " + ali.getNom());
    }
}
