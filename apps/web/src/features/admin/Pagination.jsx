import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const PAGE_SIZE = 10;

export function usePagination(records) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(records.length / PAGE_SIZE));

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  return {
    page,
    pageCount,
    pageRecords: records.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    setPage,
  };
}

function Pagination({ page, pageCount, totalRecords, onPageChange, recordLabel }) {
  if (pageCount <= 1) return null;
  const firstRecord = (page - 1) * PAGE_SIZE + 1;
  const lastRecord = Math.min(page * PAGE_SIZE, totalRecords);

  return (
    <nav aria-label={`${recordLabel} pagination`} className="admin-pagination">
      <span>Showing {firstRecord}–{lastRecord} of {totalRecords}</span>
      <div className="admin-pagination-controls">
        <button
          aria-label={`Previous ${recordLabel} page`}
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
          type="button"
        >
          <ChevronLeft size={15} /> Previous
        </button>
        <span aria-live="polite">Page {page} of {pageCount}</span>
        <button
          aria-label={`Next ${recordLabel} page`}
          disabled={page === pageCount}
          onClick={() => onPageChange(page + 1)}
          type="button"
        >
          Next <ChevronRight size={15} />
        </button>
      </div>
    </nav>
  );
}

export default Pagination;
