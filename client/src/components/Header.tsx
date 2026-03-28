interface HeaderProps {
  totalCount: number;
}

export function Header({ totalCount }: HeaderProps) {
  return (
    <div className="header">
      <div className="logo-block">
        <img className="logo-icon" src="/logo.jpg" alt="CO" />
        <div className="logo-text">
          <span>КОМИ</span>ГРАЦИЯ
        </div>
      </div>
      <div className="stats-bar">
        <div className="pulse" />
        <span className="count">{totalCount}</span>
        <span className="label">на карте</span>
      </div>
    </div>
  );
}
