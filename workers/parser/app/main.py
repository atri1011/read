import time

from app.settings import settings


def main() -> None:
    print("parser worker starting", settings.queue_name, flush=True)
    while True:
        # replaced in M2/M3 with BRPOP/arq/bullmq bridge
        time.sleep(5)


if __name__ == "__main__":
    main()
