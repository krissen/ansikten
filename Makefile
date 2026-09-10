# `make setup` / `make check`: one-command contributor bootstrap for the
# local quality gate, and the one command a session or a PR runs before
# treating something as done. `check` runs the same grind
# `.pre-commit-config.yaml` enforces at commit time, once more without
# --fix over the *whole* tree, plus both test suites. Full output goes to
# .check.log (gitignored); stdout stays a handful of lines on success and
# the tail of the log on failure.
#
# Deliberately re-runs the linters WITHOUT --fix on the whole tree, in
# addition to prek: `prek run --files <an untracked file>` with a --fix hook
# silently rewrites the file and reports Passed, because there is no index
# entry yet to diff against. A brand-new, still-untracked module would look
# clean here if this target only ran prek. `ruff check .` and `eslint .`
# with no fix flag give that file a real, failing verdict instead.
#
# Same reasoning for gitleaks: the pre-commit hook's default `--staged`
# scan only sees the index, so an unstaged or untracked file with a secret
# would pass through `prek run --all-files` silently. `gitleaks dir .`
# below sweeps the whole working tree, mirroring the CI lint job's separate
# secrets step.
#
# Also needs backend/.venv (ruff, pytest) and frontend/node_modules
# (eslint, vitest) already set up -- see "Backend API" and "Frontend"
# under Quick Commands above. The preflight check below fails with a
# one-line setup hint instead of a bare "No such file or directory" from
# deep inside the target.
LOG := $(CURDIR)/.check.log

.PHONY: setup check

# See scripts/setup.sh for the full rationale (pinned prek, hooksPath
# detection, idempotent re-runs).
setup:
	@scripts/setup.sh

# PREK_BIN resolves once, at parse time, to the version-scoped binary
# `make setup` installs under ~/.local/state/ansikten-prek/<version>/bin/
# (preferred, so a stray global `prek` -- a different version, or none --
# is never picked up silently, defeating the pinning), falling back to a
# bare PATH lookup for machines where prek is already installed globally
# (e.g. via brew) and `make setup` only checked for it rather than
# installing it (the core.hooksPath case -- see scripts/setup.sh).
PREK_VERSION := $(shell grep -o "PREK_VERSION: '[0-9][0-9.]*'" .github/workflows/ci.yml | head -n1 | sed "s/.*'\(.*\)'/\1/")
PREK_PERSIST_BIN := $(HOME)/.local/state/ansikten-prek/$(PREK_VERSION)/bin/prek
PREK_BIN := $(if $(wildcard $(PREK_PERSIST_BIN)),$(PREK_PERSIST_BIN),prek)

check:
	@command -v $(PREK_BIN) >/dev/null 2>&1 || { echo "missing: prek -- run make setup"; exit 1; }
	@command -v gitleaks >/dev/null 2>&1 || { echo "missing: gitleaks -- run make setup"; exit 1; }
	@test -x backend/.venv/bin/ruff || { \
	  echo "backend/.venv missing -- run: cd backend && python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'"; \
	  exit 1; }
	@test -d frontend/node_modules || { \
	  echo "frontend/node_modules missing -- run: cd frontend && npm ci"; \
	  exit 1; }
	@rm -f $(LOG)
	@{ echo "== prek --all-files =="; \
	   $(PREK_BIN) run --all-files; \
	} >>$(LOG) 2>&1 || { tail -40 $(LOG); exit 1; }
	@{ echo "== gitleaks dir (whole tree, including untracked/unstaged) =="; \
	   gitleaks dir . --no-banner; \
	} >>$(LOG) 2>&1 || { tail -30 $(LOG); exit 1; }
	@{ echo "== ruff check (no --fix, whole tree) =="; \
	   backend/.venv/bin/ruff check .; \
	} >>$(LOG) 2>&1 || { tail -30 $(LOG); exit 1; }
	@{ echo "== eslint (no --fix) =="; \
	   cd frontend && npx eslint .; \
	} >>$(LOG) 2>&1 || { tail -30 $(LOG); exit 1; }
	@{ echo "== prettier --check (no --write) =="; \
	   cd frontend && npx prettier --check 'src/**/*.{js,jsx}' 'scripts/**/*.js' 'tests/**/*.{js,jsx}' 'main.js' '*.config.{js,mjs}' package.json '**/*.css' '**/*.html'; \
	} >>$(LOG) 2>&1 || { tail -30 $(LOG); exit 1; }
	@{ echo "== backend pytest =="; \
	   cd backend && .venv/bin/python -m pytest -q; \
	} >>$(LOG) 2>&1 || { tail -30 $(LOG); exit 1; }
	@{ echo "== frontend vitest =="; \
	   cd frontend && npx vitest run --reporter=dot; \
	} >>$(LOG) 2>&1 || { tail -40 $(LOG); exit 1; }
	@tail -3 $(LOG)
