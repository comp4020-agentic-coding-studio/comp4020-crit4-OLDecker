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
happened to line up and read as one bug. Once I stopped trusting the obvious
explanation and actually looked at what was stacked on top of what, the fix
was a single CSS property. The same thing happened with a drag animation
that passed its own automated test and still didn't work for a real click —
the test just wasn't simulating the thing that was actually breaking it.

That changed what I trust as "verified." A green check or a passing test
tells you the thing you thought to test for is fine, not that the feature
works — and the two moments I got wrong here were both cases where I'd
already convinced myself something was correct before actually looking. I
want to be the kind of developer who treats a first fix as a hypothesis, not
an answer, and who checks the thing itself rather than the story I already
have for why it's broken.
