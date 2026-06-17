# Knowledge Base Extraction Pipeline

This module extracts knowledge base data from the Karnataka IPGRS portal and generates structured documents for use in Vaani's retrieval system.

## What it does

* Fetches Services for a Department
* Fetches Schemes for each Service
* Fetches Knowledge Base details for each Scheme
* Cleans and normalizes the data
* Generates structured knowledge documents (`knowledge_docs.jsonl`)

## Files

* `scrape.py` – Extracts data from IPGRS APIs
* `clean.py` – Cleans and normalizes raw data
* `transform.py` – Converts raw records into a canonical format
* `main.py` – Entry point for running the pipeline

## Run

```bash
python scrape.py 
