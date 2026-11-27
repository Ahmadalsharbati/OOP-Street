# OOP Street

**See Java objects come alive.** Write a class and a `Launcher`, then run it step by step.
Every class becomes a district with its blueprint board, and every `new` builds a house in the street.

> Made by Ahmad Alsharbati while learning Java OOP at ENI École (Rennes).
> For learners: simple English, real Java, real Eclipse error messages.

**Live version:** https://ahmadalsharbati.github.io/OOP-Street/

---

## The idea

| Java | In the street |
|---|---|
| `class` | a blueprint on a green board |
| `new` | a real house built from the blueprint |
| field | a basket inside the house |
| `private` | a locked room (red lock) |
| getter / setter | a service window in the wall |
| `static` | a shared kiosk: one for all houses |
| variable | a sign in a person's hand, pointing at a house |
| `null` | an empty sign |
| `main` | a person walking in the street, doing each line |
| Garbage Collector | a robot that cleans houses nobody points at |

## What works today (phases 1–3)

- **A real Java interpreter, written in JavaScript**, for the part of Java taught in a first OOP course:
  classes, fields, constructors (with overloading and `this(...)`), methods, `static`, `final`,
  `public` / `private` / package visibility, packages and `import`, `this`, `null`, arrays (also 2D),
  `if` / `else`, `switch`, `for`, for-each, `while`, `do while`, `break`, `continue`, `toString()`,
  `String` methods, `Math`, `Integer.parseInt`, `System.out.printf`.
- **Works with any code.** No class name is written inside the tool. Many classes, many objects.
- **Step by step, forward and backward:** Step (F5), Next line (F6), Back, To end, Reset.
- **Eclipse-style errors**, on the right line:
  `The field Etudiant.nom is not visible`, `Cannot make a static reference to the non-static method...`,
  `jean cannot be resolved to a variable`, `The constructor Etudiant() is undefined`,
  `NullPointerException: Cannot invoke "Etudiant.getNom()" because "jean" is null`, `StackOverflowError`...
- **Variables view** like the Eclipse debugger (ids, yellow = changed now) and the call stack (pile).
- **The street** (three.js), modern design (v2):
  - fixed camera angle like a board game: **drag to move, scroll to zoom**, no rotation, you never get lost.
  - **Focus mode**: only what the current line uses is big; everything else is small and faded (**Show all** to see everything).
  - every class has its own color and district: a **blueprint stand** (click it to see all fields, constructors, methods
    with 🔒 private, + public, ~ package, S static, F final) and a **static kiosk** for shared fields.
  - every object is a rounded **house** that pops up when built: its card shows the fields and values,
    a red **lock** if it has private fields, **windows** for its public methods, a yellow ring when it is `this`.
  - a **person** walks to where the code runs and holds the variables. **Amber arrows**: variable → object (pile → tas).
    **Indigo arrows**: field → other object. Arrays are rows of numbered **mailboxes**.
  - bubbles for new object, returned value, console, blocked (the lock shakes), errors.
  - a caption under the street explains each step in one simple sentence.
- **Dark code editor with Java colors**, Variables and Console in tabs.
- **Drag the handles** between the code, the street and the panel to resize them (double-click to hide), or press the
  "big street" button.
- **Phase 4 — the street reacts to every call:**
  - the person **knocks on the window** of the house before a method runs, and the windows light up;
  - during `new`, **workers** build the house and fill its baskets; the **roof goes on** when the constructor ends;
  - when you step inside a method, a **code card** next to the house shows that method with the current line;
  - a setter that **refuses** a value (like `setAge(-3)` with an `if`) shows it: the value comes back, the field stays.
- **Phase 5 — live UML class diagram** (button **UML** over the street), made from your code:
  - classes with `+ − ~` visibility, static underlined, constructors and methods, and how many objects exist now;
  - a field whose type is another class becomes a line: arrow = one way, plain line = both know each other,
    `0..1` for one object, `0..*` for an array;
  - **agrégation ◇ or composition ◆ is found automatically**: `new B(...)` put in the field inside the class = composition;
    a parameter put in the field (constructor, setter, `ajouter...`) = agrégation. Each relation says **why**;
  - live: the class running now is yellow, a relation that changes in this step turns orange.
- **Concepts** (button over the street): the OOP concepts of YOUR program as glowing picture cards
  (class & objects, encapsulation, inheritance, polymorphism, abstraction, composition, agrégation, two-way,
  static, super, null & GC, the error of the run). Only what the code really uses. Download one card or all
  of them as one PNG poster.
- **Click a line number** to jump to the moment that line runs. `×3` next to the number = it runs 3 times;
  click again for the next time. Click a class or field line to fly to its district. **Replay** plays the line again slowly,
  **Play** (or Space) runs the program by itself.

- **Inheritance (héritage):** `extends`, `super(...)`, `super.method()`, `protected`, `@Override` with late binding,
  `abstract` classes and methods, polymorphism (`Animal a = new Chien()`), `instanceof`, casts and `ClassCastException`.
  In the street: inherited baskets are tagged with the parent class, a bubble shows when the parent part is built
  (super) and which version of a method runs (inherited / @Override / super). In the UML: empty-triangle arrows,
  `«abstract»` and italic abstract methods, `#` for protected.

Not supported yet (you get a clear message, never a silent failure):
interfaces, `ArrayList`, `Scanner`, lambdas.

## Run it on your computer

No build step. Any static web server works:

```bash
git clone https://github.com/Ahmadalsharbati/OOP-Street.git
cd OOP-Street
python3 -m http.server 8080
```

Then open http://localhost:8080

## Tests

The tests run Java programs in OOP Street **and** in the real JVM, and check that the output is identical.

```bash
npm install      # only for three.js updates; the tests need no package
npm test         # needs Node 18+, and javac/java for the comparison
```

## How the code is organised

```
index.html              the page
css/style.css           colors and layout
js/main.js              connects editor, runner, scene and panels
js/examples.js          ready-made example programs

js/java/lexer.js        source text  -> tokens
js/java/parser.js       tokens       -> tree of the program (AST)
js/java/interpreter.js  runs the tree step by step (the pile, the tas, visibility rules, errors)
js/java/builtins.js     System.out, String, Math, Integer...
js/java/values.js       how int, double, String, objects are stored
js/java/errors.js       syntax error / compilation problem / exception / not supported
js/java/runner.js       runs the whole program once and records every step (so Back works)

js/layout/layout.js     where districts and houses go (grows with the program)
js/scene/scene.js       the 3D street with three.js + HTML labels on top
js/ui/explain.js        one simple sentence for each step

tests/programs/         programs compared with real Java
tests/errors/           programs that must give a precise error
vendor/three/           three.js (MIT license), no CDN needed
```

## Roadmap

1. ✅ Setup: repository, structure, three.js, GitHub Pages
2. ✅ The generic interpreter + tests against the real JVM
3. ✅ The 3D street: baskets, locks, windows, people with signs, camera that follows the line
4. ✅ Connect every step to the street: knock, workers, code card, refused setter, clickable lines, Replay / Play
5. ✅ Associations and a live UML diagram (agrégation / composition found automatically)
6. static, final, pile/tas, Garbage Collector, null
7. Course examples, "Try the bug", Challenge mode, big exercises (10+ classes)

## License

MIT — see [LICENSE](LICENSE). three.js is © three.js authors, MIT license.
