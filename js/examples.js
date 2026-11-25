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
];
