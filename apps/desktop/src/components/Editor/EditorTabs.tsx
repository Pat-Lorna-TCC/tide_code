import { useCallback } from "react";
import { useWorkspaceStore } from "../../stores/workspace";
import styles from "./EditorTabs.module.css";

export function EditorTabs() {
  const { openTabs, activeTabPath, setActiveTab, closeTab } =
    useWorkspaceStore();

  const handleClose = useCallback(
    (e: React.MouseEvent, path: string) => {
      e.stopPropagation();
      closeTab(path);
    },
    [closeTab],
  );

  if (openTabs.length === 0) return null;

  return (
    <div className={styles.tabBar}>
      {openTabs.map((tab) => (
        <div
          key={tab.path}
          className={`${styles.tab} ${tab.path === activeTabPath ? styles.tabActive : ""}`}
          onClick={() => setActiveTab(tab.path)}
        >
          {tab.isDirty && <span className={styles.dirtyDot} />}
          <span className={styles.tabName}>{tab.name}</span>
          <button
            className={styles.closeBtn}
            onClick={(e) => handleClose(e, tab.path)}
            title="Close"
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
