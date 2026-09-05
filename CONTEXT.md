# Manual SAMUR Mobile Reference

This context defines the language for the Spanish-only native reference companion to the Manual SAMUR web product. It describes the reference domains and user-facing groupings without prescribing implementation.

## Reference domains

**Reference item**:
A procedure, medicine, code, SAMUR base, or hospital that a responder looks up in the app. _Avoid_: record, clinical case, patient item

**Procedure**:
An official manual entry describing an emergency, operational, technical, communication, psychological, administrative, or related response topic. _Avoid_: workflow, protocol step

**Vademécum**:
The published medicine reference, including generic medicines, commercial names, perfusions, and fluids. _Avoid_: prescription, treatment recommendation

**Code**:
A SAMUR radio, incident, pathology, communication, or operational reference entry. _Avoid_: command, alert

**Location reference**:
A validated SAMUR base or hospital entry used for directory lookup and optional navigation handoff. _Avoid_: route, live destination

## App groupings

**Saved**:
The local area containing user-favorited reference items and recently opened reference items. _Avoid_: account, synced library

**Information hub**:
The secondary area containing Abbreviations, Collaborators, synchronization information, preferences, appearance, sources, disclaimer, About, and Legal. _Avoid_: Settings-only menu

**Dose-conversion utility**:
An optional medication-detail utility that calculates a volume or rate from a clinician-entered prescribed amount or dose rate and an explicit published concentration; it does not recommend a medicine or dose. _Avoid_: dose recommender, clinical decision support

**Clinician-entered prescription**:
The amount or dose rate supplied by the treating clinician as an input to an arithmetic conversion; it is not an app-generated recommendation. _Avoid_: suggested dose, treatment plan

**Published concentration**:
An explicit amount-per-volume value attached to a published medication presentation and approved for calculation; it is not inferred from narrative dose instructions. _Avoid_: inferred concentration

**Manual SAMUR medication record**:
A medication presentation published in the official Manual SAMUR Vademécum; publication is the clinical approval boundary for this utility, and external or custom medication records are excluded. _Avoid_: imported medication, custom drug
