"use client";

import { useState } from "react";
import DisagreementList, { type ArticleFull } from "./DisagreementList";
import GenerateIterationButton from "./GenerateIterationButton";
import type { DisagreementRow } from "@/lib/lab/value-scoring/evaluation";

interface Props {
  rows:             DisagreementRow[];
  articles:         Record<string, ArticleFull>;
  promptId:         string;
  promptVersion:    number;
}

export default function EvaluationActions({ rows, articles, promptId, promptVersion }: Props) {
  const [filteredPairIds, setFilteredPairIds] = useState<string[]>(rows.map(r => r.pairId));

  return (
    <>
      <DisagreementList
        rows={rows}
        articles={articles}
        onFilterChange={setFilteredPairIds}
      />
      <GenerateIterationButton
        promptId={promptId}
        promptVersion={promptVersion}
        filterPairIds={filteredPairIds}
      />
    </>
  );
}
