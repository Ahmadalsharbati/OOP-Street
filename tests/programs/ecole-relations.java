class Salle {
    private String nom;
    private int places;
    private static int nbSalles = 0;

    public Salle(String nom, int places) {
        this.nom = nom;
        this.places = places;
        nbSalles++;
    }

    public String getNom() {
        return nom;
    }

    public int getPlaces() {
        return places;
    }

    public static int getNbSalles() {
        return nbSalles;
    }
}

class Ecole {
    private String nom;
    private Salle[] salles = new Salle[3];
    private int nbSalles;

    public Ecole(String nom) {
        this.nom = nom;
    }

    // composition: the school builds its own rooms
    public void ajouterSalle(String nomSalle, int places) {
        if (nbSalles < salles.length) {
            salles[nbSalles] = new Salle(nomSalle, places);
            nbSalles++;
        }
    }

    public Salle getSalle(int i) {
        return salles[i];
    }

    public int totalPlaces() {
        int total = 0;
        for (int i = 0; i < nbSalles; i++) {
            total = total + salles[i].getPlaces();
        }
        return total;
    }
}

class Professeur {
    private String nom;
    private Salle bureau;
    private static int nbProfesseurs = 0;

    public Professeur(String nom) {
        this.nom = nom;
        nbProfesseurs++;
    }

    // simple association: the office comes from a method call
    public void choisirBureau(Ecole ecole) {
        bureau = ecole.getSalle(2);
    }

    public String getNom() {
        return nom;
    }

    public static int getNbProfesseurs() {
        return nbProfesseurs;
    }
}

class Cours {
    private String titre;
    private Professeur professeur;
    private Salle salle;
    private static int nbCours = 0;

    // agregation: the teacher already exists, he comes from outside
    public Cours(String titre, Professeur professeur) {
        this.titre = titre;
        this.professeur = professeur;
        nbCours++;
    }

    // agregation: the room comes from outside
    public void setSalle(Salle salle) {
        this.salle = salle;
    }

    public String toString() {
        String s = titre + " avec " + professeur.getNom();
        if (salle != null) {
            s = s + " en " + salle.getNom();
        }
        return s;
    }

    public static int getNbCours() {
        return nbCours;
    }
}

class Etudiant {
    private String nom;
    private Groupe groupe;
    private static int nbEtudiants = 0;

    public Etudiant(String nom) {
        this.nom = nom;
        nbEtudiants++;
    }

    public void setGroupe(Groupe groupe) {
        this.groupe = groupe;
    }

    public String getNom() {
        return nom;
    }

    public static int getNbEtudiants() {
        return nbEtudiants;
    }
}

class Groupe {
    private String nom;
    private Etudiant[] etudiants = new Etudiant[3];
    private int nbEtudiants;
    private Cours[] cours = new Cours[3];
    private int nbCours;

    public Groupe(String nom) {
        this.nom = nom;
    }

    // two-way: the group knows its students, each student knows its group
    public void ajouterEtudiant(Etudiant e) {
        if (nbEtudiants < etudiants.length) {
            etudiants[nbEtudiants] = e;
            nbEtudiants++;
            e.setGroupe(this);
        }
    }

    public void ajouterCours(Cours c) {
        if (nbCours < cours.length) {
            cours[nbCours] = c;
            nbCours++;
        }
    }

    public void afficher() {
        System.out.println("Groupe " + nom + " :");
        for (int i = 0; i < nbEtudiants; i++) {
            System.out.println("  etudiant : " + etudiants[i].getNom());
        }
        for (int i = 0; i < nbCours; i++) {
            System.out.println("  cours : " + cours[i]);
        }
    }
}

public class Launcher {
    public static void main(String[] args) {
        // the school and its 3 rooms (composition)
        Ecole eni = new Ecole("ENI Rennes");
        eni.ajouterSalle("Salle A", 20);
        eni.ajouterSalle("Salle B", 15);
        eni.ajouterSalle("Bureau", 2);
        System.out.println("Places : " + eni.totalPlaces());

        // 3 teachers
        Professeur p1 = new Professeur("Dupont");
        Professeur p2 = new Professeur("Martin");
        Professeur p3 = new Professeur("Bernard");
        p1.choisirBureau(eni);

        // 3 courses (agregation with the teachers and the rooms)
        Cours java = new Cours("Java", p1);
        Cours html = new Cours("HTML", p2);
        Cours algo = new Cours("Algo", p3);
        java.setSalle(eni.getSalle(0));
        html.setSalle(eni.getSalle(1));

        // 3 students in one group (two-way)
        Etudiant e1 = new Etudiant("Jean");
        Etudiant e2 = new Etudiant("Marie");
        Etudiant e3 = new Etudiant("Ali");
        Groupe dwwm = new Groupe("DWWM");
        dwwm.ajouterEtudiant(e1);
        dwwm.ajouterEtudiant(e2);
        dwwm.ajouterEtudiant(e3);
        dwwm.ajouterCours(java);
        dwwm.ajouterCours(html);
        dwwm.ajouterCours(algo);
        dwwm.afficher();

        // static counters
        System.out.println("Salles : " + Salle.getNbSalles());
        System.out.println("Professeurs : " + Professeur.getNbProfesseurs());
        System.out.println("Cours : " + Cours.getNbCours());
        System.out.println("Etudiants : " + Etudiant.getNbEtudiants());
    }
}
