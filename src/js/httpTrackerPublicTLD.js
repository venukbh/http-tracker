const public_suffix_list = [];

const public_suffix_map = new Map();
public_suffix_list.forEach((v) => {
  public_suffix_map.set(v, v);
});
