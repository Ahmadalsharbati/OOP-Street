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
- **The 3D street** (three.js):
  - every class is a district with its **blueprint board**: fields, how to build a house (`new`), methods,
    with 🔒 private, + public, ~ package, S static, F final.
  - `static` fields live in a shared **kiosk** next to the board.
  - every object is a **house** that grows when built: its card shows the baskets (fields) and values,
    a red **lock** if it has private fields, **windows** for its public methods.
  - a wooden **person** walks to the house where the code runs. Their card shows the method and its
    variables (signs). **Yellow arrows**: variable ➜ object (pile ➜ tas). **Green arrows**: field ➜ other object.
  - arrays are rows of numbered **mailboxes**.
  - bubbles: 🔨 new house built, ↩ value given back, 🖨 console, 🔒 blocked (the lock shakes), ✖ error.
  - grey house = nobody points at it any more (Garbage Collector).
  - camera follows the person (Follow), or see everything (Fit all).

Not supported yet (you get a clear message, never a silent failure):
inheritance (`extends`), interfaces, `ArrayList`, `Scanner`, lambdas.

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
4. Connect every step to the street: new / get / set / private / public, Step Into, errors in the scene
5. Associations and arrays (Livre → Auteur, Etudiant ⇄ Classe) and a live UML diagram
6. static, final, pile/tas, Garbage Collector, null
7. Course examples, "Try the bug", Challenge mode, big exercises (10+ classes)

## License

MIT — see [LICENSE](LICENSE). three.js is © three.js authors, MIT license.
