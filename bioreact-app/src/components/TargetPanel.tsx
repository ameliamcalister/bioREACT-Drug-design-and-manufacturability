/**
 * TargetPanel.tsx — choose the protein, or set up a new one.
 *
 * The one thing a user has to understand here is why the reference ligand
 * matters: it is what tells the tool WHERE on the protein to dock. With a
 * pose file the grid is boxed tightly around the known site; without one
 * the whole protein is searched, which is slower and much less reliable. A
 * SMILES names the molecule but carries no coordinates, so it cannot do
 * that job — and the form says so rather than silently degrading.
 */
import { useState } from 'react';
import { Upload, X } from 'lucide-react';
import { api, readFileAsBase64, sourceMode } from '../api';
import type { TargetSummary } from '../types';
import {
  Button,
  Caveat,
  ErrorText,
  Field,
  Note,
  Panel,
  Select,
  Spinner,
  TextInput,
} from './ui';

export function TargetPanel({
  targets,
  active,
  disabled,
  onChanged,
}: {
  targets: TargetSummary[];
  active: TargetSummary | null;
  disabled?: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [referenceName, setReferenceName] = useState('');
  const [ligandSmiles, setLigandSmiles] = useState('');
  const [receptorFile, setReceptorFile] = useState<File | null>(null);
  const [ligandFile, setLigandFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const demo = sourceMode() === 'demo';

  const submit = async () => {
    setError(null);
    setMessage(null);
    if (!name.trim()) {
      setError('Give the target a name.');
      return;
    }
    if (!receptorFile) {
      setError('A receptor file is required — .pdb or .pdbqt.');
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim(),
        reference_name: referenceName.trim(),
        ligand_smiles: ligandSmiles.trim(),
        receptor: await readFileAsBase64(receptorFile),
        ligand: ligandFile ? await readFileAsBase64(ligandFile) : null,
      };
      const result = await api.createTarget(body);
      setMessage(
        `${result.target.name} is ready — site from ${result.target.grid_source}. Run the loop to design against it.`,
      );
      setName('');
      setDescription('');
      setReferenceName('');
      setLigandSmiles('');
      setReceptorFile(null);
      setLigandFile(null);
      onChanged();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title="Target protein"
      help="Everything on the other screens is computed against this structure and this binding site."
      aside={
        <Button
          tone="secondary"
          icon={open ? <X className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
          onClick={() => setOpen((value) => !value)}
          disabled={disabled || demo}
          title={demo ? 'preparing a receptor needs Open Babel, which the demo has not got' : undefined}
        >
          {open ? 'Cancel' : 'Use your own protein'}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <Field label="Protein" help="switching target changes every result on screen">
            <Select
              value={active?.slug ?? ''}
              disabled={disabled || targets.length === 0}
              onChange={(slug) => {
                api
                  .selectTarget(slug)
                  .then(onChanged)
                  .catch((problem) =>
                    setError(problem instanceof Error ? problem.message : String(problem)),
                  );
              }}
              options={targets.map((target) => ({
                value: target.slug,
                label: `${target.name} — site from ${target.grid_source}`,
              }))}
            />
          </Field>

          {active && (
            <div className="text-xs leading-relaxed text-ink-2">
              {active.description && <p>{active.description}</p>}
              <p className="mt-1 font-mono text-[11px]">
                {active.receptor_atoms
                  ? `${active.receptor_atoms.toLocaleString()} atoms · `
                  : ''}
                box {active.box.filter(Boolean).join(' × ')} Å
                {active.reference_name ? ` · reference ${active.reference_name}` : ''}
                {active.reference_affinity != null
                  ? ` at ${active.reference_affinity} kcal/mol`
                  : ''}
                {active.chembl_target_id ? ` · ChEMBL ${active.chembl_target_id}` : ''}
              </p>
            </div>
          )}
        </div>

        {active?.blind && (
          <Caveat>
            This target has no reference pose, so docking searches the whole protein. That is
            slower and much less reliable than boxing a known site — add a reference ligand file
            if you have one.
          </Caveat>
        )}

        {open && (
          <div className="space-y-3 rounded-md border border-line bg-surface-2 p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Protein name" help="e.g. EGFR">
                <TextInput value={name} onChange={setName} placeholder="EGFR" disabled={busy} />
              </Field>
              <Field
                label="Receptor file (required)"
                help=".pdb is converted for you; .pdbqt is used as it is"
              >
                <input
                  type="file"
                  accept=".pdb,.pdbqt,.ent"
                  disabled={busy}
                  onChange={(event) => setReceptorFile(event.target.files?.[0] ?? null)}
                  className="w-full rounded-md border border-line-strong bg-surface px-2 py-1.5 text-xs"
                />
              </Field>
              <Field
                label="Reference ligand pose (recommended)"
                help=".pdb / .sdf / .mol2 from the crystal structure — this is what defines the site"
              >
                <input
                  type="file"
                  accept=".pdb,.pdbqt,.sdf,.mol,.mol2,.smi"
                  disabled={busy}
                  onChange={(event) => setLigandFile(event.target.files?.[0] ?? null)}
                  className="w-full rounded-md border border-line-strong bg-surface px-2 py-1.5 text-xs"
                />
              </Field>
              <Field label="Reference ligand name" help="shown as the comparison in every table">
                <TextInput
                  value={referenceName}
                  onChange={setReferenceName}
                  placeholder="erlotinib"
                  disabled={busy}
                />
              </Field>
              <Field
                label="Reference SMILES (optional)"
                help="names the molecule for the designer; it carries no coordinates, so it cannot define the site"
              >
                <TextInput
                  value={ligandSmiles}
                  onChange={setLigandSmiles}
                  placeholder="CC(=O)Oc1ccccc1C(=O)O"
                  disabled={busy}
                />
              </Field>
              <Field label="What is it?" help="one line; it goes into the designer’s brief">
                <TextInput
                  value={description}
                  onChange={setDescription}
                  placeholder="a receptor tyrosine kinase"
                  disabled={busy}
                />
              </Field>
            </div>

            <Note>
              If the ligand is already inside your PDB file, pull it out first — for example{' '}
              <code>grep &quot;^HETATM&quot; structure.pdb | grep &quot; ATP &quot; &gt; ligand.pdb</code>{' '}
              — and upload that as the reference pose.
            </Note>

            <div className="flex items-center gap-3">
              <Button tone="primary" onClick={submit} disabled={busy}>
                Prepare target
              </Button>
              {busy && <Spinner label="converting the receptor with Open Babel…" />}
            </div>
          </div>
        )}

        {error && <ErrorText>{error}</ErrorText>}
        {message && (
          <p className="rounded-md border border-pass/40 bg-pass-soft px-3 py-2 text-xs text-pass">
            {message}
          </p>
        )}
      </div>
    </Panel>
  );
}
