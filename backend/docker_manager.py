"""Docker control layer for GPGPU-Sim experiments.

Responsibilities:
  * discover the GPGPU-Sim container(s) we can run experiments in
  * exec commands inside them, handling the environment setup GPGPU-Sim needs

GPGPU-Sim gotchas baked into ENV_PREAMBLE (discovered the hard way — see
backend/run_test.py history):
  1. setup_environment requires CUDA_INSTALL_PATH to be exported FIRST.
  2. setup_environment derives its lib path from the container's gcc version
     (4.6.3), but GPGPU-Sim was actually built with gcc-4.5.1. So we override
     LD_LIBRARY_PATH to the path that really contains libcudart.so.4.
Without this, the benchmark fails with "libcudart.so.4: cannot open shared
object file".
"""

import os
from typing import Iterator, List, Optional, Tuple, Union

import docker
from docker.models.containers import Container

# --- Container discovery --------------------------------------------------

# Label convention from CLAUDE.md. Real containers may not carry it yet, so
# discovery falls back to a known container name (override via env var).
GPGPU_LABEL = "gpgpu-sim=true"
FALLBACK_CONTAINER = os.environ.get("GPGPU_CONTAINER", "relaxed_shaw")

# --- GPGPU-Sim environment ------------------------------------------------

CUDA_INSTALL_PATH = "/opt/cuda-installers/toolkitcuda42/cuda"
GPGPU_LIB = "/opt/gpgpu-sim_distribution/lib/gcc-4.5.1/cuda-4020/release"

ENV_PREAMBLE = (
    f"export CUDA_INSTALL_PATH={CUDA_INSTALL_PATH} && "
    f"source /opt/gpgpu-sim_distribution/setup_environment >/dev/null 2>&1 && "
    f"export LD_LIBRARY_PATH={GPGPU_LIB}:$LD_LIBRARY_PATH"
)

ContainerRef = Union[str, Container]

_client: Optional[docker.DockerClient] = None


def get_client() -> docker.DockerClient:
    """Return a cached Docker client connected to the local daemon."""
    global _client
    if _client is None:
        _client = docker.from_env()
    return _client


def _container_info(c: Container) -> dict:
    image = c.image.tags[0] if c.image.tags else c.image.short_id
    return {
        "id": c.short_id,
        "name": c.name,
        "image": image,
        "status": c.status,
    }


def get_containers() -> List[dict]:
    """List running GPGPU-Sim containers.

    Prefers containers labeled ``gpgpu-sim=true``. If none are labeled (the
    current dev setup), falls back to the container named FALLBACK_CONTAINER
    so the pipeline still works before labels are wired up.

    Returns a list of dicts: {id, name, image, status}.
    """
    client = get_client()

    labeled = client.containers.list(filters={"label": GPGPU_LABEL, "status": "running"})
    if labeled:
        return [_container_info(c) for c in labeled]

    # Fallback: the known container, if it's running.
    try:
        c = client.containers.get(FALLBACK_CONTAINER)
        if c.status == "running":
            return [_container_info(c)]
    except docker.errors.NotFound:
        pass

    return []


def _resolve_container(container: ContainerRef) -> Container:
    """Accept a Container object, an id, or a name and return a Container."""
    if isinstance(container, Container):
        return container
    return get_client().containers.get(container)


def exec_in_container(
    container: ContainerRef,
    cmd: str,
    with_env: bool = True,
    workdir: Optional[str] = None,
) -> Tuple[int, str]:
    """Run a shell command inside a container and return (exit_code, output).

    Args:
        container: Container object, id, or name.
        cmd: shell command (run via ``bash -c``).
        with_env: prepend the GPGPU-Sim ENV_PREAMBLE (needed for any command
            that invokes a benchmark; harmless but skippable for plain shell).
        workdir: optional directory to cd into before running.

    stdout and stderr are merged into the returned string.
    """
    c = _resolve_container(container)
    full = _build_cmd(cmd, with_env, workdir)
    exit_code, output = c.exec_run(["bash", "-c", full], stream=False, demux=False)
    return exit_code, output.decode("utf-8", errors="replace")


def stream_in_container(
    container: ContainerRef,
    cmd: str,
    with_env: bool = True,
    workdir: Optional[str] = None,
) -> Iterator[str]:
    """Run a command and yield output line by line as it is produced.

    Needed for live streaming to the UI later. The process exit code is not
    available through this API — use exec_in_container when you need it.
    """
    c = _resolve_container(container)
    full = _build_cmd(cmd, with_env, workdir)
    _, stream = c.exec_run(["bash", "-c", full], stream=True, demux=False)

    buf = b""
    for chunk in stream:
        buf += chunk
        while b"\n" in buf:
            line, buf = buf.split(b"\n", 1)
            yield line.decode("utf-8", errors="replace")
    if buf:
        yield buf.decode("utf-8", errors="replace")


def _build_cmd(cmd: str, with_env: bool, workdir: Optional[str]) -> str:
    parts = []
    if with_env:
        parts.append(ENV_PREAMBLE)
    if workdir:
        parts.append(f"cd {workdir}")
    parts.append(cmd)
    return " && ".join(parts)
