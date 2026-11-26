class Etudiant {
    private String nom;
    private int age;
    private static int nbEtudiants = 0;

    public Etudiant(String nom, int age) {
        this.nom = nom;
        this.age = age;
        nbEtudiants++;
    }

    public String getNom() {
        return nom;
    }

    public void setAge(int age) {
        if (age > 0) {
            this.age = age;
        }
    }

    public void anniversaire() {
        age++;
    }

    public static int getNbEtudiants() {
        return nbEtudiants;
    }

    public String toString() {
        return nom + " (" + age + " ans)";
    }
}

class Professeur {
    private String nom;
    private String matiere;
    private static int nbProfesseurs = 0;

    public Professeur(String nom, String matiere) {
        this.nom = nom;
        this.matiere = matiere;
        nbProfesseurs++;
    }

    public String presenter() {
        return "Je suis " + nom + ", prof de " + matiere;
    }

    public static int getNbProfesseurs() {
        return nbProfesseurs;
    }
}

class Livre {
    private String titre;
    private int pages;
    private boolean emprunte;
    private static int nbLivres = 0;

    public Livre(String titre, int pages) {
        this.titre = titre;
        this.pages = pages;
        this.emprunte = false;
        nbLivres++;
    }

    public void emprunter() {
        if (emprunte) {
            System.out.println(titre + " est deja emprunte");
        } else {
            emprunte = true;
            System.out.println(titre + " est emprunte");
        }
    }

    public int getPages() {
        return pages;
    }

    public static int getNbLivres() {
        return nbLivres;
    }
}

class Voiture {
    private String marque;
    private int vitesse;
    private static int nbVoitures = 0;

    public Voiture(String marque) {
        this.marque = marque;
        this.vitesse = 0;
        nbVoitures++;
    }

    public void accelerer(int valeur) {
        vitesse = vitesse + valeur;
    }

    public void freiner() {
        vitesse = 0;
    }

    public int getVitesse() {
        return vitesse;
    }

    public static int getNbVoitures() {
        return nbVoitures;
    }

    public String toString() {
        return marque + " roule a " + vitesse + " km/h";
    }
}

class Animal {
    private String nom;
    private String cri;
    private static int nbAnimaux = 0;

    public Animal(String nom, String cri) {
        this.nom = nom;
        this.cri = cri;
        nbAnimaux++;
    }

    public void parler() {
        System.out.println(nom + " dit " + cri);
    }

    public static int getNbAnimaux() {
        return nbAnimaux;
    }
}

public class Launcher {
    public static void main(String[] args) {
        // 3 etudiants
        Etudiant e1 = new Etudiant("Jean", 20);
        Etudiant e2 = new Etudiant("Marie", 22);
        Etudiant e3 = new Etudiant("Ali", 19);
        e1.anniversaire();
        e2.setAge(-5);
        System.out.println(e1);
        System.out.println(e2);
        System.out.println(e3.getNom());

        // 3 professeurs
        Professeur p1 = new Professeur("Dupont", "Java");
        Professeur p2 = new Professeur("Martin", "HTML");
        Professeur p3 = new Professeur("Bernard", "Algo");
        System.out.println(p1.presenter());
        System.out.println(p3.presenter());

        // 3 livres
        Livre l1 = new Livre("Java facile", 300);
        Livre l2 = new Livre("HTML pour tous", 150);
        Livre l3 = new Livre("Algo pas a pas", 220);
        l1.emprunter();
        l1.emprunter();
        int total = l1.getPages() + l2.getPages() + l3.getPages();
        System.out.println("Pages en tout : " + total);

        // 3 voitures
        Voiture v1 = new Voiture("Renault");
        Voiture v2 = new Voiture("Peugeot");
        Voiture v3 = new Voiture("Citroen");
        v1.accelerer(50);
        v2.accelerer(30);
        v2.accelerer(20);
        v3.accelerer(90);
        v3.freiner();
        System.out.println(v1);
        System.out.println(v2);
        System.out.println(v3);

        // 3 animaux
        Animal a1 = new Animal("Rex", "Wouf");
        Animal a2 = new Animal("Minou", "Miaou");
        Animal a3 = new Animal("Coco", "Cot cot");
        a1.parler();
        a2.parler();
        a3.parler();

        // static : un compteur pour toute la classe
        System.out.println("Etudiants : " + Etudiant.getNbEtudiants());
        System.out.println("Professeurs : " + Professeur.getNbProfesseurs());
        System.out.println("Livres : " + Livre.getNbLivres());
        System.out.println("Voitures : " + Voiture.getNbVoitures());
        System.out.println("Animaux : " + Animal.getNbAnimaux());
    }
}
