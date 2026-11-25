public class Etudiant {
    private String nom;
    private int age;
    private Classe classe;
    private static int nbInstances = 0;

    public Etudiant(String nom, int age) {
        this.nom = nom;
        this.age = age;
        nbInstances++;
    }

    public String getNom() { return nom; }
    public int getAge() { return age; }
    public void setAge(int age) {
        if (age > 0) {
            this.age = age;
        } else {
            System.out.println("Age invalide : " + age);
        }
    }
    public Classe getClasse() { return classe; }
    public void setClasse(Classe classe) { this.classe = classe; }
    public static int getNbInstances() { return nbInstances; }

    @Override
    public String toString() {
        return nom + " (" + age + " ans)" + (classe != null ? " - " + classe.getNom() : "");
    }
}

class Classe {
    private String nom;
    private Etudiant[] etudiants = new Etudiant[3];
    private int nb;

    public Classe(String nom) { this.nom = nom; }
    public String getNom() { return nom; }

    public boolean ajouterEtudiant(Etudiant e) {
        if (nb >= etudiants.length) {
            return false;
        }
        etudiants[nb] = e;
        nb++;
        e.setClasse(this);
        return true;
    }

    public void afficher() {
        System.out.println("Classe " + nom + " :");
        for (int i = 0; i < nb; i++) {
            System.out.println(" - " + etudiants[i]);
        }
    }
}

class Launcher {
    public static void main(String[] args) {
        Etudiant jean = new Etudiant("Jean", 25);
        Etudiant marie = new Etudiant("Marie", 22);
        System.out.println(jean.getNom());
        jean.setAge(-3);
        jean.setAge(26);
        Classe cda = new Classe("CDA");
        cda.ajouterEtudiant(jean);
        cda.ajouterEtudiant(marie);
        System.out.println(cda.ajouterEtudiant(new Etudiant("Paul", 30)));
        System.out.println(cda.ajouterEtudiant(new Etudiant("Zoe", 19)));
        cda.afficher();
        System.out.println(jean);
        System.out.println("Instances : " + Etudiant.getNbInstances());
        Etudiant copie = jean;
        copie.setAge(40);
        System.out.println(jean.getAge() + " " + (copie == jean));
        jean = null;
        System.out.println(jean);
    }
}
