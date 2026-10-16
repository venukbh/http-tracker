const httpTrackerHeaderRules = (function() {
  let headerRowCounter = 1;

  function syncHeaderRulesFromUI() {
    const headersObject = [];
    const containers = getByClassNames('single_header_container');
    for (const headerContainer of containers) {
      const nameInput = headerContainer.querySelector('.header_input_name');
      const nameLabel = headerContainer.querySelector('.add_header_name');
      const applyChk = headerContainer.querySelector('.header_input_apply');
      const valueInput = headerContainer.querySelector('.header_input_value');
      const urlInput = headerContainer.querySelector('.header_input_url');

      const headerName = nameInput.value.trim();
      const isValidHeaderName = RFC_HEADER_NAME_REGEX.test(headerName);
      if (headerName) {
        if (isValidHeaderName &&
          !FORBIDDEN_HEADERS.some((v) => headerName.toLowerCase() === v.toLowerCase()) &&
          !FORBIDDEN_HEADER_PREFIXES.some((v) => headerName.toLowerCase().startsWith(v.toLowerCase()))) {
          nameLabel.style.color = '';
          nameInput.style.borderColor = '';
          nameInput.classList.remove('header_input_invalid');
          if (applyChk.checked) {
            headersObject.push({name: headerName, value: valueInput.value, url: urlInput.value.trim()});
          }
        } else {
          nameLabel.style.color = 'red';
          nameInput.style.borderColor = '#e53e3e';
          nameInput.classList.add('header_input_invalid');
        }
      } else {
        nameLabel.style.color = '';
        nameInput.style.borderColor = '';
        nameInput.classList.remove('header_input_invalid');
      }
    }
    updateHeaderModifySessionRules(headersObject);
    const count = (headersObject.length || containers.length) ? ` (${headersObject.length})` : '';
    const banner = getById('add_modify_headers_banner');
    if (banner) {
      banner.textContent = `Modify headers${count}`;
    }
  }

  const debouncedSyncHeaderRules = debounce(syncHeaderRulesFromUI, INPUT_BOX_DELAY);

  function removeHeaderRow(event) {
    const target = event.target || event;
    const index = target.dataset?.headerIndex;
    if (index === '0') {
      const nameInput = getById('header_name_0');
      if (nameInput) {
        nameInput.value = '';
        nameInput.style.borderColor = '';
        nameInput.classList.remove('header_input_invalid');
      }
      getById('header_value_0').value = '';
      getById('header_url_0').value = '';
      getById('header_apply_0').checked = false;
      const nameLabel = getById('header_details_0')?.querySelector('.add_header_name');
      if (nameLabel) {
        nameLabel.style.color = '';
      }
    } else {
      const container = target.closest?.('.single_header_container');
      if (container) {
        container.remove();
      }
    }
    syncHeaderRulesFromUI();
  }

  function addHeaderRow() {
    const nextIndex = headerRowCounter++;
    const tmpl = getById('template_header_row');
    if (tmpl?.content) {
      const fragment = tmpl.content.cloneNode(true);
      const headerDiv = fragment.firstElementChild;
      headerDiv.id = `header_details_${nextIndex}`;

      const nameInput = headerDiv.querySelector('.header_input_name');
      nameInput.id = `header_name_${nextIndex}`;
      headerDiv.querySelector('.add_header_name label').htmlFor = nameInput.id;
      const nameClear = headerDiv.querySelector('.add_header_name .input_clear_btn');
      if (nameClear) nameClear.dataset.clearTarget = nameInput.id;

      const valueInput = headerDiv.querySelector('.header_input_value');
      valueInput.id = `header_value_${nextIndex}`;
      headerDiv.querySelector('.add_header_value label').htmlFor = valueInput.id;
      const valueClear = headerDiv.querySelector('.add_header_value .input_clear_btn');
      if (valueClear) valueClear.dataset.clearTarget = valueInput.id;

      const urlInput = headerDiv.querySelector('.header_input_url');
      urlInput.id = `header_url_${nextIndex}`;
      headerDiv.querySelector('.add_header_url label').htmlFor = urlInput.id;
      const urlClear = headerDiv.querySelector('.add_header_url .input_clear_btn');
      if (urlClear) urlClear.dataset.clearTarget = urlInput.id;

      const applyInput = headerDiv.querySelector('.header_input_apply');
      applyInput.id = `header_apply_${nextIndex}`;
      headerDiv.querySelector('.add_header_apply label').htmlFor = applyInput.id;

      const removeButton = headerDiv.querySelector('.header_button_remove');
      removeButton.id = `header_button_remove_${nextIndex}`;
      removeButton.dataset.headerIndex = nextIndex;
      removeButton.onclick = removeHeaderRow;

      getById('add_modify_headers').appendChild(fragment);
    }
  }

  function init() {
    const removeBtn0 = getById('header_button_remove_0');
    if (removeBtn0) {
      removeBtn0.onclick = removeHeaderRow;
    }
    const addBtn0 = getById('header_button_add_0');
    if (addBtn0) {
      addBtn0.onclick = addHeaderRow;
    }
    const container = getById('add_modify_headers');
    if (container) {
      container.oninput = debouncedSyncHeaderRules;
      container.addEventListener('change', debouncedSyncHeaderRules);
    }
  }

  return {
    init,
    syncHeaderRulesFromUI,
    addHeaderRow,
    removeHeaderRow,
    generateHeadersToAddOrModify: syncHeaderRulesFromUI,
    addNewHeaderContainer: addHeaderRow,
    clearAndRemoveHeaderContents: removeHeaderRow,
  };
})();
