class Auteur {
    private String nom;
    private String prenom;
    public Auteur(String nom, String prenom) { this.nom = nom; this.prenom = prenom; }
    public String getNomComplet() { return prenom + " " + nom.toUpperCase(); }
}

class Livre {
    private String titre;
    private Auteur auteur;
    private double prix;
    private final String isbn;

    public Livre(String titre, Auteur auteur, double prix, String isbn) {
        this.titre = titre;
        this.auteur = auteur;
        this.prix = prix;
        this.isbn = isbn;
    }
    public Livre(String titre, String isbn) {
        this(titre, null, 9.99, isbn);
    }
    public Auteur getAuteur() { return auteur; }
    public double getPrix() { return prix; }
    public String toString() {
        String a = auteur == null ? "inconnu" : auteur.getNomComplet();
        return titre + " de " + a + " - " + prix + " euros [" + isbn + "]";
    }
}

public class Main {
    public static void main(String[] args) {
        Auteur hugo = new Auteur("Hugo", "Victor");
        Livre l1 = new Livre("Les Miserables", hugo, 12.5, "978-1");
        Livre l2 = new Livre("Anonyme", "978-2");
        Livre[] biblio = { l1, l2, null };
        double total = 0;
        for (Livre l : biblio) {
            if (l != null) {
                System.out.println(l);
                total += l.getPrix();
            }
        }
        System.out.println("Total: " + total);
        System.out.printf("Total: %.2f euros%n", total);
        System.out.println(biblio.length + " " + (l1.getAuteur() == hugo));
        int[] notes = new int[4];
        notes[1] = 15;
        notes[3] = notes[1] / 2;
        String s = "";
        for (int i = 0; i < notes.length; i++) s += notes[i] + ";";
        System.out.println(s);
        System.out.println(7 / 2 + " " + 7 / 2.0 + " " + 7 % 3 + " " + (double) 7 / 2 + " " + (int) 3.99);
        char c = 'A';
        c++;
        System.out.println(c + " " + (c + 1) + " " + (char) (c + 1));
        System.out.println(1.0 / 3 + " " + 100.0 + " " + 1e7 + " " + 0.0001 + " " + 10000000 * 3);
        long big = 3000000000L;
        System.out.println(big * 2);
        System.out.println(Math.max(3, 8) + " " + Math.sqrt(16) + " " + Math.pow(2, 10) + " " + Math.round(2.5) + " " + Math.abs(-4));
        String a = "Java";
        String b = "Ja";
        String c2 = b + "va";
        System.out.println((a == c2) + " " + a.equals(c2) + " " + a.length() + " " + a.charAt(1) + " " + a.substring(1, 3) + " " + a.indexOf('v'));
        int x = 5;
        x += 2.7;
        System.out.println(x);
        switch (x) {
            case 1: System.out.println("un"); break;
            case 7: System.out.println("sept");
            case 8: System.out.println("huit"); break;
            default: System.out.println("autre");
        }
        int k = 0;
        while (true) {
            k++;
            if (k % 2 == 0) continue;
            if (k > 7) break;
            System.out.print(k + " ");
        }
        System.out.println();
        int[][] grille = new int[2][3];
        grille[1][2] = 9;
        System.out.println(grille[1][2] + grille[0].length);
        boolean ok = !(x > 3 && x < 10) || x == 7;
        System.out.println(ok ? "oui" : "non");
        do { k--; } while (k > 5);
        System.out.println(k);
    }
}
