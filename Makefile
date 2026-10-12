.PHONY: up down logs test prod reset desktop desktop-down

up:
	docker compose up -d --build --wait

down:
	docker compose down

logs:
	docker compose logs -f

test:
	bash scripts/test-scan.sh

prod:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build --wait

desktop:
	bash scripts/start-desktop.sh

desktop-down:
	docker compose -f docker-compose.yml -f docker-compose.desktop.yml --profile desktop stop desktop-gateway lab-desktop lab-target

# Reset dibatasi ke proyek ini; tidak memakai docker system prune global.
reset:
	bash scripts/reset.sh
