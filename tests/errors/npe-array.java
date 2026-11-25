// EXPECT: Cannot invoke "Livre.getTitre()" because "etagere[i]" is null
// LINE: 19
class Livre {
    private String titre;

    public Livre(String titre) {
        this.titre = titre;
    }

    public String getTitre() {
        return titre;
    }
}

public class Launcher {
    public static void main(String[] args) {
        Livre[] etagere = new Livre[3];
        etagere[0] = new Livre("Java pour les nuls");
        for (int i = 0; i < etagere.length; i++) {
            System.out.println(etagere[i].getTitre());
        }
    }
}
