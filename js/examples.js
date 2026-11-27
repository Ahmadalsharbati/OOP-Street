// examples.js — ready-made programs. The simulator itself knows nothing about these
// class names: it works with any code. These are only starting points.

export const EXAMPLES = [
  {
    id: 'etudiant-classe',
    title: 'Etudiant & Classe (two-way association)',
    code: `public class Etudiant {
    private String nom;
    private int age;
    private Classe classe;
    private static int nbInstances = 0;

    public Etudiant(String nom, int age) {
        this.nom = nom;
        this.age = age;
        nbInstances++;
    }

    public String getNom() {
        return nom;
    }

    public void setAge(int age) {
        if (age > 0) {
            this.age = age;
        } else {
            System.out.println("Invalid age: " + age);
        }
    }

    public void setClasse(Classe classe) {
        this.classe = classe;
    }

    public String toString() {
        return nom + " (" + age + ")";
    }
}

class Classe {
    private String nom;
    private Etudiant[] etudiants = new Etudiant[3];
    private int nb;

    public Classe(String nom) {
        this.nom = nom;
    }

    public void ajouterEtudiant(Etudiant e) {
        etudiants[nb] = e;
        nb++;
        e.setClasse(this);
    }
}

class Launcher {
    public static void main(String[] args) {
        Etudiant jean = new Etudiant("Jean", 25);
        System.out.println(jean.getNom());
        jean.setAge(-3);
        Classe cda = new Classe("CDA");
        cda.ajouterEtudiant(jean);
        System.out.println(jean);
        jean = null;
    }
}
`,
  },
  {
    id: 'livre-auteur',
    title: 'Livre → Auteur (one-way association)',
    code: `class Auteur {
    private String nom;

    public Auteur(String nom) {
        this.nom = nom;
    }

    public String getNom() {
        return nom;
    }
}

class Livre {
    private String titre;
    private Auteur auteur;

    public Livre(String titre, Auteur auteur) {
        this.titre = titre;
        this.auteur = auteur;
    }

    public String toString() {
        return titre + " by " + auteur.getNom();
    }
}

public class Launcher {
    public static void main(String[] args) {
        Auteur hugo = new Auteur("Victor Hugo");
        Livre l1 = new Livre("Les Miserables", hugo);
        Livre l2 = new Livre("Notre-Dame de Paris", hugo);
        System.out.println(l1);
        System.out.println(l2);
    }
}
`,
  },
  {
    id: 'private-error',
    title: 'Try the bug: private field from outside',
    code: `class Patient {
    private String nom;

    public Patient(String nom) {
        this.nom = nom;
    }

    public String getNom() {
        return nom;
    }
}

public class Launcher {
    public static void main(String[] args) {
        Patient p = new Patient("Ali");
        System.out.println(p.getNom());
        System.out.println(p.nom);
    }
}
`,
  },
  {
    id: 'static-compteur',
    title: 'static: one shared counter (Patient)',
    code: `class Patient {
    private static int compteur = 0;
    private final int id;
    private String nom;

    public Patient(String nom) {
        compteur++;
        this.id = compteur;
        this.nom = nom;
    }

    public static int getCompteur() {
        return compteur;
    }

    public String toString() {
        return "Patient " + id + ": " + nom;
    }
}

public class Launcher {
    public static void main(String[] args) {
        Patient p1 = new Patient("Ali");
        Patient p2 = new Patient("Lina");
        Patient p3 = new Patient("Sam");
        System.out.println(p2);
        System.out.println(Patient.getCompteur());
        p1 = null;
    }
}
`,
  },
  {
    id: 'static-error',
    title: 'Try the bug: method called on the class',
    code: `class Etudiant {
    private String nom;

    public Etudiant(String nom) {
        this.nom = nom;
    }

    public String getNom() {
        return nom;
    }
}

public class Launcher {
    public static void main(String[] args) {
        Etudiant jean = new Etudiant("Jean");
        System.out.println(jean.getNom());
        System.out.println(Etudiant.getNom());
    }
}
`,
  },
  {
    id: 'npe',
    title: 'Try the bug: NullPointerException',
    code: `class Livre {
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
`,
  },
  {
    id: 'big-five',
    title: 'Big test: 5 classes × 3 objects + static',
    code: `class Etudiant {
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
`,
  },
  {
    id: 'maison-composition',
    title: 'Composition vs agrégation (Maison, Piece, Proprietaire)',
    code: `class Piece {
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
`,
  },
];
