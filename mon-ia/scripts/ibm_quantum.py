#!/usr/bin/env python3
"""Exécute un circuit OpenQASM 2 sur un vrai ordinateur quantique IBM (ou en local avec --local).

Usage :  ibm_quantum.py submit [--shots N] [--backend NOM] [--local]   (circuit lu sur l'entrée standard)
         ibm_quantum.py result JOB_ID
Le jeton est lu dans IBM_QUANTUM_TOKEN (et l'instance, optionnelle, dans IBM_QUANTUM_INSTANCE).
Installation :  pip install qiskit qiskit-ibm-runtime
"""
import json, os, sys


def out(obj):
    print(json.dumps(obj, ensure_ascii=False))
    sys.exit(0)


def counts_of(pub_result):
    data = pub_result.data
    merged = {}
    for name in data:  # un registre classique par nom
        merged[name] = getattr(data, name).get_counts()
    return merged


def main():
    try:
        from qiskit import qasm2
        from qiskit.transpiler import generate_preset_pass_manager
    except ImportError:
        out({"error": "Qiskit n'est pas installé sur le serveur. Lance : pip install qiskit qiskit-ibm-runtime"})

    args = sys.argv[1:]
    cmd = args[0] if args else ""
    opt = lambda name, default=None: args[args.index(name) + 1] if name in args else default

    if cmd == "submit" and "--local" in args:
        from qiskit.primitives import StatevectorSampler
        circuit = qasm2.loads(sys.stdin.read(), custom_instructions=qasm2.LEGACY_CUSTOM_INSTRUCTIONS)
        result = StatevectorSampler().run([circuit], shots=int(opt("--shots", 1024))).result()
        out({"status": "DONE", "backend": "simulateur local Qiskit", "counts": counts_of(result[0])})

    from qiskit_ibm_runtime import QiskitRuntimeService, SamplerV2
    token = os.environ.get("IBM_QUANTUM_TOKEN")
    if not token:
        out({"error": "Jeton IBM Quantum manquant (Admin → Intégrations → Quantique)."})
    service = QiskitRuntimeService(channel="ibm_quantum_platform", token=token, instance=os.environ.get("IBM_QUANTUM_INSTANCE") or None)

    if cmd == "submit":
        circuit = qasm2.loads(sys.stdin.read(), custom_instructions=qasm2.LEGACY_CUSTOM_INSTRUCTIONS)
        name = opt("--backend")
        backend = service.backend(name) if name else service.least_busy(operational=True, simulator=False, min_num_qubits=circuit.num_qubits)
        isa = generate_preset_pass_manager(backend=backend, optimization_level=1).run(circuit)
        job = SamplerV2(mode=backend).run([isa], shots=int(opt("--shots", 1024)))
        out({"status": "SUBMITTED", "job_id": job.job_id(), "backend": backend.name,
             "message": "Circuit envoyé. La file d'attente peut durer de quelques secondes à plusieurs heures : récupère le résultat plus tard avec l'identifiant."})
    if cmd == "result":
        job = service.job(args[1])
        status = str(job.status())
        if "DONE" not in status.upper():
            out({"status": status, "job_id": args[1]})
        out({"status": "DONE", "job_id": args[1], "backend": job.backend().name, "counts": counts_of(job.result()[0])})
    out({"error": "Commande inconnue (submit ou result)."})


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:  # erreur lisible pour l'IA
        print(json.dumps({"error": f"{type(e).__name__}: {str(e)[:500]}"}, ensure_ascii=False))
