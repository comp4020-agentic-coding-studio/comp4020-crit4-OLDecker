# Crit 4 reflection

The first issue I ran into was that it's quite hard to build something like
you expect on the first go — the pond looked fine as a flat 2D layout in my
head, but once it existed it didn't read as a place you could actually play,
so the whole idea only became legible after I let it become a real 3D scene
instead of arguing with the 2D version.

The actual breakthrough was realising that a bug that looks visual isn't
always where it looks like it is. Pads seemed to go transparent right when
they pulsed, which pointed straight at the pulse animation — but the real
cause was a DOM ripple ring painting above the WebGL canvas and blending
into it at exactly the moment each pad triggered, so two unrelated things
happened to line up and read as one bug. The fix was a single CSS property,
once I stopped trusting the obvious explanation and looked at what was
stacked on what. A near-identical symptom reappeared later — pads
flickering transparent, worse while pulsing — but this time the cause was
inside the models themselves: some glTF meshes shipped literal duplicate
triangles, and a material setting I needed elsewhere for genuinely broken
geometry made both copies render and z-fight whenever the pad's transform
changed. Only raycasting into the live scene and dumping each mesh's
triangle count told the two bugs apart, instead of me reapplying the first
fix to a cause it couldn't touch. The same lesson showed up again with a
drag animation that passed its own automated test and still didn't work for
a real click — the test just wasn't simulating the thing that was actually
breaking it.

That changed what I trust as "verified." A green check or a passing test
tells you the thing you thought to test for is fine, not that the feature
works — and each of these moments was a case where I'd already convinced
myself something was correct before actually looking. I
want to be the kind of developer who treats a first fix as a hypothesis, not
an answer, and who checks the thing itself rather than the story I already
have for why it's broken.
