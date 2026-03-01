export default function Search({ 
  value, 
  onChange, 
  onKeyPress, 
  placeholder = "Tìm kiếm việc làm",
  onSearch 
}) {
  return (
    <div className="form-icon-left">
      <input
        type="text"
        name="text"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onKeyPress={onKeyPress}
        className="form-control"
      />
    </div>
  );
}
