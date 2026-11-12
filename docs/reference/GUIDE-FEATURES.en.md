This is a comprehensive, organized feature list (GDD-style Feature Set) that overlays the Tactical Simulation / AI Co-dependency system onto your foundational 2D Souls-like platformer vertical slice (the office worker in the Lovecraftian city).

🛠 CORE GAMEPLAY FEATURE LIST & MECHANICS SPECIFICATION


1. Tactical Pause & Indirect Control (The Dragon Age Layer)

Instead of direct button-to-action inputs, the player acts as a бестелесный дух (Omnipresent Guide), issuing instructions via a time-freezing tactical interface.
• Active Pause Engine: Pressing the spacebar/trigger completely freezes the world action, desaturating the screen to let the player inspect the 2D layout.
• Action Queuing (Command Line): Allows the player to chain up to 3 actions on the timeline (e.g., Move 3 steps ➔ Hold Shield for 1s ➔ Roll Backward).
• Vector Trajectory Mapping (The Oracle Lines):
	• Green Vectors: Paths indicating optimal, safe inputs for platforming and dodging.
	• Yellow Vectors: Risky trajectories (susceptible to knockback or environmental traps).
	• Red Vectors: Immediate death paths (leads directly into spike pits, chasm drops, or active enemy x-boxes).
• Anatomy-First Aiming: During pause, players can click specific limb points on enemies to order the Hero to target them (e.g., slashing a giant cultist's knee to bring him down to eye level).

2. Survival & Well-Being Engine (The Sims Layer)

The Hero is a mortal vessel with human physical limits. Their willingness and ability to cooperate with your tactical demands depend on their real-time physical status.

📊 The Core Needs (Vital Stats)

• Energy / Sleep (Шкала Усталости): Drops during sprint/combat. If empty, the Hero suffers from "Micro-sleep" stutters, messing up action timings and hallucinating false platforms.
• Satiety / Hunger (Шкала Голода): Drops over time. When starving, attack damage scales down by 50%, and the Hero moves sluggishly.
• Stress & Sanity (Психическое напряжение): Spikes when taking sudden damage or staying in the dark too long. High stress causes the Hero to panic and scream.
• Hygiene / Blood Corruption (Чистота): Covers the Hero as they slay Lovecraftian beasts. Eldritch grime accelerates stress build-up and poisons health over time if not washed off.

🏡 Safehouses & Base Management (The Ruined Houses)

• Safehouse Instance Transition: Seamlessly switches the game from a tactical platformer to a cozy/grim base management UI when entering safe zones.
• The Rest Loop: Directing the Hero to use found objects to replenish stats:
	• The Cot/Bed: Replenishes Energy, resets sanity debuffs.
	• The Hearth / Kitchen: Cooking gathered rations (e.g., canned stew) to fix Hunger.
	• The Wash Basin / Shower: Cleans eldritch grime, freezing the stress-multiplier meter.
• The Coffee Station (High Priority): Brewing scarce coffee beans gives the Hero a "Caffeine Rush" buff, temporarily locking the stamina bar at maximum capacity and forcing a 100% Obedience state for the next room.

3. The Hero’s AI Evolution (The Self-Awareness Layer)

As the game progresses, the Hero evolves from a helpless, terrified puppet into a self-reliant warrior who develops their own ego and begins resisting your direct control.
• The Core Metagame Stat — Volition (Шкала Воли): A sliding metric tracking the relationship balance across 3 dynamic game phases.
• Phase I: Blind Dependence (Акт I)
	• Behavior: Hero has awful standalone AI. Timings are clunky, and they will freeze in terror without commands.
	• Mechanic: 100% obedience. Every command drawn on the tactical pause is executed perfectly without pushback.
• Phase II: Absolute Ego & Defiance (Акт II)
	• Behavior: The Hero finds powerful gear, learns the local monster patterns, and starts moving autonomously without your pause inputs.
	• Mechanic: The Command Resistance. When you pause to issue a command, the Hero's AI actively pulls the cursor back. Forcing them to obey burns through your mental energy currency. The Hero will routinely drop your tactical queue to execute an attack they deem better.
• Phase III: Harmonized Sync (Акт III)
	• Behavior: Achieved after the narrative tipping point. The Hero respects your vision but expects you to respect their reflexes.
	• Mechanic: Hybrid control. The Hero handles micro-dodging automatically, freeing you to focus entirely on macro environmental manipulation.

4. Reality Intervention Tools (The Player's Arsenal)

The Player uses their own pool of spiritual energy (Mana/Focus) to physically manifest solutions directly into the 2D workspace during or outside of tactical pause.
• Manifest Construct (Эфемерная платформа): Clicking open space manifests a temporary, fragile platform out of thin air. Lasts for 3 seconds before shattering—just enough for the Hero to execute a double-jump fix.
• Manifest Barricade (Внезапная стена): Drops a heavy stone block to block boss projectiles or trap rampaging monsters.
• Airdrop Logistics (Кофе на передовую): Spawns items out of your inventory directly into the active battlefield (e.g., throwing a warm steak or a mug of hot coffee onto the ground mid-fight so the Hero can grab it on a roll).
• Loot Lure (Приманка): Spawns a glittering item projection in a specific location to force the Hero's autonomous AI to walk exactly where you want them to go (e.g., walking them into a trap you've prepared for an ambush).

5. Gaslighting & Sabotage System (The Anti-Hero Toolkit)

During Act II, to prevent the Hero from escaping the city alone and leaving you behind, you must use counter-intuitive tools to break their spirit and keep them dependent on you.
• Environment Shifting: Secretly sliding an active platform slightly away right before the Hero jumps, causing them to miss their landing and plummet into mud pools (damaging their ego and hygiene stats).
• Monster Overcharging: Spending your own mana to buff an incoming basic enemy's attack speed, forcing the arrogant Hero to take a massive hit, panic, and click your help button.
• Safehouse Sabotage: Intentionally breaking the plumbing or sabotaging the bed in the safehouses to trigger sleep deprivation and high stress, artificially forcing them back into a state where they need your tactical pause guidance to survive.

6. The Act III Reversal System (The Vulnerable Player Layer)

The ultimate shift: the environment begins attacking the Player's meta-interface, making you completely weak and dependent on the Hero's physical protection to survive.
• Interface Corruption (Sensory Blindness): The tactical pause screen suffers from extreme static and fog. Hidden spikes, traps, and hitboxes are totally invisible to the player. You must rely on the Hero's physical gaze, torch direction, and auditory callouts to know where to build bridges.
• Cursor Hunting (The Ethereal Nexus): Specialized monsters ignore the Hero and fly straight toward the player's mouse cursor/camera view. Touch drains your energy instantly. You must use the tactical pause to position the Hero as a literal physical shield to swing their weapon and slice these ghosts away from your screen.
• Mental Burnout Event: Passing through psychic zones reduces your player energy to absolute zero. The tactical pause is completely disabled. The Hero must act entirely on their high-level standalone AI to carry your paralyzed camera view safely through the gauntlet.
• Safehouse Nursing: In the final safehouses, the role flips completely. You cannot click to interact. The Hero autonomously approaches the screen, sets up camp, and slides a cup of hot coffee toward the camera to physically refill your player UI resource bars.
Would you like to detail the specific User Interface design layout (where the Sims needs, command lines, and Volition bars fit on the screen without cluttering the 2D action) or establish the technical blueprint for how the Hero's AI code prioritizes its own logic over the player's commands in Act II?
