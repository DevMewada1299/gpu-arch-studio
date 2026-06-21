import docker

CONTAINER_NAME = "relaxed_shaw"

# GPGPU-Sim needs its environment sourced before the benchmark can find
# its own libcudart.so.4. Two gotchas in this container:
#   1. setup_environment requires CUDA_INSTALL_PATH to be set first.
#   2. setup_environment derives the lib path from the container's gcc
#      (4.6.3), but GPGPU-Sim was actually built with gcc-4.5.1 — so we
#      override LD_LIBRARY_PATH to the path that really contains the libs.
CUDA_INSTALL_PATH = "/opt/cuda-installers/toolkitcuda42/cuda"
GPGPU_LIB = "/opt/gpgpu-sim_distribution/lib/gcc-4.5.1/cuda-4020/release"
BENCH_DIR = "/tmp/benchmarks/JPEG"

CMD = (
    f"export CUDA_INSTALL_PATH={CUDA_INSTALL_PATH} && "
    f"source /opt/gpgpu-sim_distribution/setup_environment >/dev/null 2>&1 && "
    f"export LD_LIBRARY_PATH={GPGPU_LIB}:$LD_LIBRARY_PATH && "
    f"cd {BENCH_DIR} && "
    f"./gpgpu_ptx_sim__JPEG --encode --file=cameraman.bmp"
)

client = docker.from_env()
container = client.containers.get(CONTAINER_NAME)

print(f"Container: {container.name} ({container.status})")
print(f"{'='*60}")

exit_code, output = container.exec_run(["bash", "-c", CMD], stream=False, demux=False)
print(output.decode("utf-8", errors="replace"))
print(f"{'='*60}\nExit code: {exit_code}")
