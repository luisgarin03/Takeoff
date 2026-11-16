# Gate placement and fence standards research

Research checked November 15, 2026. This is a product and standards orientation for takeoff visualization, not a project specification or a gate-safety design. The issued plans, governing code, project manual, manufacturer submittal, and adopted standard editions control each job.

## How the Count placement works

- A gate Count markup remains a normal saved takeoff count with its own shape ID. Its gate type and opening width are stored on that markup; generated gate and component IDs are derived from that unique count ID.
- The gate is associated with the nearest straight Chain-link or Ornamental route in the same condition and sheet. The clicked point centers the opening. The full requested width must fit inside one straight edge; curved edges and openings that cross a bend are not eligible. Place the Count mark directly on the intended fence edge.
- The condition's fence type controls the gate infill and frame material. Moving or deleting the Count markup updates or removes its generated gate; condition visibility hides/shows gate geometry with the rest of the condition.
- The 3D quantity group reports gate counts by type. Gate opening width affects the model opening, but does not alter the original measured takeoff LF. This feature does not create a procurement BOM, hardware takeoff, foundation design, or automatic code-compliance check.
- Defaults are 4 ft for single swing, 8 ft for double swing, and 12 ft for top-rolling slide; the user can change width in the active project units. These are UI starting values only, not standard sizes.

## Chain-link systems

Typical components include woven chain-link fabric, terminal and gate posts, tubular gate frames, framework rails, hinges, latches, a center drop rod/stop for many double-leaf arrangements, and rollers or tracks on sliding systems. Fabric options include zinc-coated steel and polymer-coated steel; gauge, mesh, selvage, fabric height, coating, framework schedule, fittings, and gate-post sizes come from the project's schedule and supplier/system submittal. [ASTM A392-11a(2026)](https://store.astm.org/a0392-11ar26.html) describes zinc-coated steel chain-link fabric, including mesh, wire size, height, selvage, coating, and strength; [ASTM F668-25](https://store.astm.org/f0668-25.html) covers polymer-coated steel chain-link fabric. [ASTM F626-14(2023)](https://store.astm.org/f0626-14r23.html) covers chain-link fittings such as rail ends, caps, sleeves, tie wires, tension/brace bands, tension bars, and related accessories. [ASTM F567-23](https://store.astm.org/f0567-23.html) covers chain-link installation procedures, including post setting/bracing, rails, tension wire, ties, fabric, barbed wire, and gates.

Gate types and applicable references:

| Gate system | What it does | Reference and scope |
|---|---|---|
| Single- or double-leaf swing | One or two framed leaves rotate on hinges at gate posts. Double gates commonly meet at a center stop and use a drop rod or plunger arrangement. | [ASTM F900-25](https://store.astm.org/f0900-25.html) covers manual industrial/commercial chain-link horizontal swing gates, posts, and accessories. Its published scope does not cover pedestrian egress gates. FHWA's [EFLHD E619-07 detail, sheet 2](https://highways.fhwa.dot.gov/federal-lands/std-drawings/E619-07.pdf) gives an agency-specific example of chain-link gate frames, posts, hinges, latches, and drop-rod hardware. |
| Overhead slide (top-supported rollers) | The leaf slides laterally while support rollers run in an overhead track; the opening itself has no ground track carrying the leaf. | [ASTM F1184-23](https://store.astm.org/f1184-23.html) Type I is an overhead slide gate supported only from above. This is the closest standards term for the user's “wheels at the top” request and the system represented by this app's **Top-rolling slide gate** option. |
| Cantilever slide | A framed leaf runs along the fence line on rollers carried by a support assembly; it spans the opening without a top or bottom support inside that opening. | [ASTM F1184-23](https://store.astm.org/f1184-23.html) Type II covers cantilever slide gates; the standard distinguishes external- and internal-roller classes. This is not the same gate as an overhead-supported Type I. |
| Ground-track / V-track rolling slide | Wheels below the gate roll on a ground track or V-track. | Supplier product terminology varies. [Master Halco's chain-link gate overview](https://www.masterhalco.com/chainlink/gates) distinguishes swing gates from slide products and lists V-track and cantilever offerings. A ground-track gate should not be labeled “overhead slide.” |

For chain-link construction and quantities, use the specific fabric, framework, fitting, gate-frame and hardware specifications named by the contract. The FHWA standard detail is an illustrative public-agency example, not a universal material schedule: it shows a double-leaf opening up to 24 ft and calls for two hinges per leaf up to 8 ft wide and three hinges for wider leaves. It also specifies a center drop-rod/stop arrangement and particular galvanized fittings. These are details of that drawing, not quantities to generalize to every project or supplier.

## Ornamental systems

Common ornamental systems use steel or aluminum posts, horizontal rails, vertical pickets, panel brackets, gate-frame members, hinges, latches, and finish/coating systems. They may be welded tubular-picket panels or other vertical-bar styles; dimensions, picket spacing, rail count, post sizing, coatings, and gate hardware are system-specific. A chain-link fabric/fitting standard does not define an ornamental system's complete gate assembly.

- [ASTM F2408-16(2023)](https://store.astm.org/f2408-16r23.html) covers coated ornamental fence systems with galvanized tubular steel pickets, including coating and structural performance requirements. It expressly excludes solid-bar or wrought-iron systems.
- [ASTM F2589-16(2021)](https://store.astm.org/f2589-16r21.html) covers coated tubular-picket ornamental fence systems made from black (not galvanized) steel components; it also excludes solid-bar and wrought-iron systems.
- [ASTM F2957-13(2025)](https://store.astm.org/f2957-13r25.html) covers architecturally coated tubular-picket ornamental aluminum fence systems.
- Use the chosen manufacturer's gate drawings and installation details for actual ornamental gate clearances, hinge/keeper selection, post spacing, finish compatibility, and opening dimensions. [Ameristar's Montage downloads](https://www.ameristarperimeter.com/us/en/resources/specs-drawings/montage) publish product-line catalogs, specifications, and gate drawings; those dimensions apply to the listed product, not ornamental fences in general.

## Rules and boundaries for estimating

1. Keep measured plan LF, gate opening width, and gate count as separate quantities. This implementation counts one placed gate Count markup as one gate EA and uses its width only to form the 3D opening. It does not convert a gate into stock-length material or multiply gate quantities by leaves, hinges, rollers, or posts.
2. An overhead slide, cantilever slide, and ground-track slide need different support geometry and hardware. Select the real system from the plans/submittal before estimating parts; this release models the overhead track/rollers requested by the user and keeps cantilever as a separate existing gate type.
3. For automated vehicular gates, [ASTM F2200-24](https://store.astm.org/f2200-24.html) covers automated vehicular gate construction; the standard also identifies UL 325 as a compliance requirement. This app's Count placements are static takeoff visuals and do not design or certify automated-gate safety systems.
4. Bid/pay quantities and measurement limits are often defined by the contract's bid item, agency specification, and project details. The app's gate EA and retained source-line LF are plan takeoff quantities, not a universal payment rule. Confirm whether the contract measures the opening, leaves, terminal assemblies, or gate hardware separately before ordering or bidding.

## Sources

- [ASTM F900-25 — Industrial and Commercial Swing Gates](https://store.astm.org/f0900-25.html)
- [ASTM F1184-23 — Industrial and Commercial Horizontal Slide Gates](https://store.astm.org/f1184-23.html)
- [ASTM F567-23 — Installation of Chain-Link Fence](https://store.astm.org/f0567-23.html)
- [ASTM F626-14(2023) — Fence Fittings](https://store.astm.org/f0626-14r23.html)
- [ASTM A392-11a(2026) — Zinc-Coated Steel Chain-Link Fabric](https://store.astm.org/a0392-11ar26.html)
- [ASTM F668-25 — Polymer-Coated Steel Chain-Link Fabric](https://store.astm.org/f0668-25.html)
- [ASTM F2408-16(2023) — Galvanized Tubular-Picket Ornamental Fence](https://store.astm.org/f2408-16r23.html)
- [ASTM F2589-16(2021) — Black-Steel Tubular-Picket Ornamental Fence](https://store.astm.org/f2589-16r21.html)
- [ASTM F2957-13(2025) — Ornamental Aluminum Fence](https://store.astm.org/f2957-13r25.html)
- [ASTM F2200-24 — Automated Vehicular Gate Construction](https://store.astm.org/f2200-24.html)
- [FHWA EFLHD Detail E619-07 — Residential Chain-Link Hardware and Gate](https://highways.fhwa.dot.gov/federal-lands/std-drawings/E619-07.pdf)
- [Master Halco — Chain-Link Gates](https://www.masterhalco.com/chainlink/gates)
- [Ameristar — Montage specifications and drawings](https://www.ameristarperimeter.com/us/en/resources/specs-drawings/montage)
