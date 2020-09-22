.DEFAULT_GOAL := help

SHELL := bash
VENV_HOME := .venv
VENV_BIN := $(VENV_HOME)/bin


.PHONY: help
help:
	@echo ""
	@echo "slither             run static analysis of contracts"
	@echo "flatten             flatten contract for use in other tools"
	@echo ""


.PHONY: slither
slither: $(VENV_HOME)
	$(VENV_BIN)/slither .

.PHONY: flatten
flatten: $(VENV_HOME)
	@if [ -z $$contract ]; then \
	    echo "Missing contract arg."; \
	    exit 1; \
	fi; \
	$(VENV_BIN)/slither-flat . --contract=$$contract

$(VENV_HOME):
	make venv_install

.PHONY: venv_install
venv_install:
	python3 -m venv $(VENV_HOME)
	$(VENV_BIN)/pip install slither-analyzer==0.6.12  # 0.6.13 has a bug with slither-flat

